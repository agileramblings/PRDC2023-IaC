import * as pulumi from "@pulumi/pulumi";
import * as network from "@pulumi/azure-native/network";
import * as k8s from "@pulumi/kubernetes";
import * as cfg from "./ConfigurationOptions";
import * as consts from "./Consts";

const defaultNamespace = "default";
const chartName = "traefik";
const appName = chartName+"-ext";
const env = pulumi.getStack();

export class TraefikExtIngressController extends pulumi.ComponentResource{

    public instantiated:boolean;
    public readonly ingressConfiguration: cfg.IngressConfiguration;
    
    constructor(name: string, config: cfg.ConfigurationOptions, opts?: pulumi.ResourceOptions){
        const inputs: pulumi.Inputs = {
            options: opts,
        };
        super("pulumi-contrib:components:TraefikExtIngressController", name, inputs, opts);
        this.instantiated = true;
        
        var secret = new k8s.core.v1.Secret(
            "secret-" + appName,
            {
                metadata: { name: `docker-credentials-${appName}`, namespace: defaultNamespace },
                data: { ".dockerconfigjson": config.acrCredentials },
                type: "kubernetes.io/dockerconfigjson",
            },
            { provider: config.k8sProvider }
        );

        //https://github.com/traefik/traefik-helm-chart/blob/master/traefik/values.yaml
        const traefikIngress = new k8s.helm.v3.Chart(
            appName,
            {
                chart: chartName,
                fetchOpts: {
                    repo: "https://helm.traefik.io/traefik",
                    version: "10.24.0",
                },
                transformations: [
                    (obj: any) => {
                        if (obj.kind === "Deployment") {
                            obj.spec.template.metadata.labels = {
                                ...obj.spec.template.metadata.labels,
                                ...{ group: "infrastructure", app: appName },
                            };
                        }
                    },
                ],
                values: {
                    logs: {
                        general: {
                            format: "json",
                            level: "DEBUG",
                        },
                    },
                    ingressClass: {
                        enabled: true,
                        isDefaultClass: false,
                        fallbackApiVersion: "v1",
                    },
                    service: {
                        annotations: {
                            "kubernetes.io/ingress.class": appName,
                        },
                    },
                    type: "LoadBalancer",
                    providers: {
                        kubernetesCRD: {
                            enabled: true, // do not disable, dashboard inaccessible without it
                        },
                        kubernetesIngress: {
                            enabled: true,
                            namespaces: [], // all namespaces
                            //endpoint: "http://localhost:8080",
                            // ingressEndpoint: {
                            //   hostname: `${config.zoneName}`
                            // }
                        },
                    },
                    additionalArguments: ["--entrypoints.web.http.redirections.entrypoint.to=:443", "--entrypoints.web.http.redirections.entrypoint.scheme=https", "--entrypoints.web.http.redirections.entrypoint.permanent=true", "--providers.kubernetesingress.ingressendpoint.hostname=localhost" /*https://github.com/pulumi/pulumi-kubernetes/issues/1915*/],
                    resources: { requests: { memory: "50Mi", cpu: "100m" }, limits: { memory: "150Mi", cpu: "300m" } },
                    deployment: {
                        replicas: 1,
                        podLabels: { group: "infrastructure", app: appName },
                        template: {
                            metadata: {
                                annotations: {
                                    "prometheus.io/scrape": "true",
                                    "prometheus.io/port": "9100",
                                },
                            },
                        },
                    },
                },
            },
            { provider: config.k8sProvider }
        );
        
        
        const svcName = `${appName}-svc`;
        const svc = new k8s.core.v1.Service(`${svcName}`, {
                metadata: {
                    name: `${svcName}`,
                    labels: { group: "infrastructure", app: appName },
                    namespace: defaultNamespace,
                },
                spec: {
                    ports: [
                        {
                            name: "http-ui",
                            port: 9000,
                            targetPort: 9000,
                            protocol: consts.tcpTransport,
                        },
                    ],
                    selector: { group: "infrastructure", app: appName },
                },
            },
            { provider: config.k8sProvider, dependsOn: [traefikIngress] }
        );

        const frontend = traefikIngress.getResourceProperty("v1/Service", appName, "status");
        const ingress = frontend.loadBalancer.ingress[0];
        const frontendIp = ingress.apply(x => x.ip ?? x.hostname);
        this.ingressConfiguration = new cfg.IngressConfiguration(false, frontendIp, "", appName);

        const exposePublicly: boolean = false;
        if (exposePublicly){
            var dashboardUri = new network.RecordSet(`${appName}-${env}-${consts.aRecordPostFix}`, {
                relativeRecordSetName: `traefik`,
                zoneName: config.zoneName,
                recordType: "A",
                resourceGroupName: config.zoneResourceGroupName,
                ttl: 600,
                aRecords: [{ ipv4Address: frontendIp}],
            });

            const ingressName = `${appName}${consts.ingressPostfix}`;
            const ingressRules = [
                {
                    host: pulumi.interpolate`${dashboardUri.name}.${config.zoneName}`,
                    http: {
                        paths: [
                            {
                                path: "/",
                                pathType: "Prefix",
                                backend: {
                                    service: {
                                        name: svcName,
                                        port: {
                                            number: 9000,
                                        },
                                    },
                                },
                            },
                        ],
                    },
                },
            ];

            const tlsHosts = [ingressRules[0].host];
            const options: k8s.networking.v1.IngressArgs = {
                metadata: {
                    name: ingressName,
                    labels: { ...{ "use-dns01-solver": "true" } },
                    annotations: {
                        "cert-manager.io/cluster-issuer": consts.leProductionIssuer, // <-- consider your rate limits,
                        "acme.cert-manager.io/http01-edit-in-place": "true",
                        "traefik.ingress.kubernetes.io/router.tls": "true",
                        "traefik.ingress.kubernetes.io/router.entrypoints": "web,websecure",
                    },
                },
                spec: {
                    tls: [
                        {
                            hosts: tlsHosts,
                            secretName: pulumi.interpolate`default-${appName}${consts.tlsSecretNamePostfix}`,
                        },
                    ],
                    rules: ingressRules,
                    ingressClassName: "traefik-ext", //we just want the traefik UI to be internal 
                },
            };

            new k8s.networking.v1.Ingress(ingressName, options, { provider: config.k8sProvider, dependsOn: [ traefikIngress ] });
        }
    }
}