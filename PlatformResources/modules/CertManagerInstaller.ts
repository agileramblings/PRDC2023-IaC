import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import * as cfg from "./ConfigurationOptions";
import * as cm from "../certmanager/crds/nodejs";
import * as consts from "./Consts";

const defaultNamespaceName = "cert-manager";
const chartName = "cert-manager";
const chartVersion = "v1.9.1";

// https://stackoverflow.com/questions/65141583/cannot-read-global-configuration-string
const azureConfig = new pulumi.Config("azure-native");

export class CertManagerInstaller extends pulumi.ComponentResource {
  constructor(
    name: string,
    config: cfg.ConfigurationOptions,
    opts?: pulumi.ResourceOptions
  ) {
    const inputs: pulumi.Inputs = {
      options: opts,
    };
    super("pulumi-contrib:components:CertManagerInstaller", name, inputs, opts);

    var namespace = new k8s.core.v1.Namespace(defaultNamespaceName,{
        metadata: {
          name: defaultNamespaceName,
        },
      },{ provider: config.k8sProvider }
    );

    // var acrCredentialsSecret = new k8s.core.v1.Secret("secret-certmanager", {
    //   metadata: { name: "docker-credentials", namespace: namespace.metadata.name },
    //   data: { ".dockerconfigjson": config.acrCredentials },
    //   type: "kubernetes.io/dockerconfigjson"
    // }, {provider: config.k8sProvider})

    //https://artifacthub.io/packages/helm/cert-manager/cert-manager
    var cmChart = new k8s.helm.v3.Chart("cert-manager", {
        chart: chartName,
        version: chartVersion,
        namespace: defaultNamespaceName,
        fetchOpts: {
          repo: "https://charts.jetstack.io",
        },
        transformations: [(obj: any) => {
          if (obj.kind === "Deployment") {
//            obj.spec.template.spec.imagePullSecrets = [{name: acrCredentialsSecret.metadata.name}];
            obj.spec.progressDeadlineSeconds = 30; //this helps speed up debugging image pull issues

            obj.spec.template.spec.containers.forEach((c:any) => {
              c.securityContext = {
                 //readOnlyRootFilesystem: true,
                 //runAsUser: 1000,
                 //runAsNonRoot: true,
                 //allowPrivilegeEscalation: false,
              };
            });

            if (obj.metadata.name==="cert-manager")
            {
              //you can apparently specify this via extraArgs but I could not get it to work:
              obj.spec.template.spec.containers[0].args.push("--dns01-recursive-nameservers-only"); 
              obj.spec.template.spec.containers[0].args.push("--dns01-recursive-nameservers=8.8.8.8:53,8.8.4.4:53"); 
            }
        }
      }],
        values: {
          installCRDs: true,
        }
      }, { provider: config.k8sProvider, dependsOn: namespace }
    );



    // create a service principal that is allowed to manage the DNS zone

    // create a secret that contains SP credentials
    var secret = azureConfig.requireSecret("clientSecret");
    new k8s.core.v1.Secret(
      "azure-config",
      {
        type: "generic",
        metadata: { name: "azure-config", namespace: defaultNamespaceName },
        stringData: {
          "client-secret": secret.apply((secret) => secret),
        },
      },
      { provider: config.k8sProvider }
    );

    // create 2 cluster issuers, one for le-staging and le-production

    new cm.certmanager.v1.ClusterIssuer(
      consts.leStagingIssuer,
      {
        metadata: {
          name: consts.leStagingIssuer,
        },
        spec: {
          acme: {
            email: consts.cloudnotificationEmailAddress,
            server: "https://acme-staging-v02.api.letsencrypt.org/directory",
            preferredChain: "ISRG Root X1",
            privateKeySecretRef: {
              name: consts.leStagingIssuer,
            },
            solvers: [
              {
                http01: { ingress: { class: "traefik-ext" } },
                selector: {
                  matchLabels: { "use-http01-solver": "true" },
                },
              },
              {
                dns01: {
                  azureDNS: {
                    clientID: azureConfig.require("clientId"),
                    clientSecretSecretRef: {
                      name: "azure-config",
                      key: "client-secret",
                    },
                    subscriptionID: azureConfig.require("subscriptionId"),
                    tenantID: azureConfig.require("tenantId"),
                    resourceGroupName: config.zoneResourceGroupName, // dns zone rg
                    hostedZoneName: config.zoneName, // zone name
                    environment: "AzurePublicCloud",
                  },
                },
                selector: {
                  matchLabels: { "use-dns01-solver": "true" },
                },
              },
            ],
          },
        },
      },
      { provider: config.k8sProvider, dependsOn: cmChart }
    );
  

    new cm.certmanager.v1.ClusterIssuer(
      consts.leProductionIssuer,
      {
        metadata: {
          name: consts.leProductionIssuer,
        },
        spec: {
          acme: {
            email: consts.cloudnotificationEmailAddress,
            server: "https://acme-v02.api.letsencrypt.org/directory",
            preferredChain: "ISRG Root X1",
            privateKeySecretRef: {
              name: consts.leProductionIssuer,
            },
            solvers: [
              {
                http01: { ingress: { class: "traefik-ext" } },
                selector: {
                  matchLabels: { "use-http01-solver": "true" },
                },
              },
              {
                dns01: {
                  azureDNS: {
                    clientID: azureConfig.require("clientId"),
                    clientSecretSecretRef: {
                      name: "azure-config",
                      key: "client-secret",
                    },
                    subscriptionID: azureConfig.require("subscriptionId"),
                    tenantID: azureConfig.require("tenantId"),
                    resourceGroupName: config.zoneResourceGroupName, // dns zone rg
                    hostedZoneName: config.zoneName, // zone name
                    environment: "AzurePublicCloud",
                  },
                },
                selector: {
                  matchLabels: { "use-dns01-solver": "true" },
                },
              },
            ],
          },
        },
      },
      { provider: config.k8sProvider, dependsOn: cmChart }
    );
  }
}
