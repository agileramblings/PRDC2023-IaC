import * as network from "@pulumi/azure-native/network";
import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";

import * as cfg from "./ConfigurationOptions";
import * as consts from "./Consts";

const env = pulumi.getStack();
const defaultNamespaceName = "diagnostics";
const appName = "kuard";
const svcName = `${appName}${consts.svcPostfix}`;
const imageName = "gcr.io/kuar-demo/kuard-amd64:blue";

const baseLabels = {...{ app: appName, role: "diagnostics"}, ...consts.baseBackEndLabels};

export class KuardInstaller extends pulumi.ComponentResource {
    public readonly instantiated: boolean;
    constructor(name: string, config: cfg.ConfigurationOptions, ingressConfiguration: cfg.IngressConfiguration, opts?: pulumi.ResourceOptions) {
        const inputs: pulumi.Inputs = {
            options: opts,
        };
        super("pulumi-contrib:components:KuardInstaller", name, inputs, opts);
        this.instantiated = true;

        var namespace = new k8s.core.v1.Namespace(
            defaultNamespaceName,
            {
                metadata: {
                    name: defaultNamespaceName,
                },
            },
            { provider: config.k8sProvider }
        );

        var deployment = new k8s.apps.v1.Deployment(
            `${appName}${consts.deploymentPostfix}`,
            {
                metadata: {
                    name: appName,
                    namespace: namespace.metadata.name,
                },
                spec: {
                    selector: { matchLabels: { app: appName } },
                    replicas: 1,
                    revisionHistoryLimit: 2,
                    template: {
                        metadata: { labels: baseLabels },
                        spec: {
                            containers: [
                                {
                                    name: appName,
                                    image: imageName,
                                    securityContext: {
                                        readOnlyRootFilesystem: true,
                                        runAsUser: 65534,
                                        runAsNonRoot: true,
                                        allowPrivilegeEscalation: false,
                                    },
                                    resources: {
                                        requests: {
                                            cpu: "100m",
                                            memory: "25Mi",
                                        },
                                        limits: {
                                            cpu: "100m",
                                            memory: "25Mi",
                                        },
                                    },
                                    ports: [{ containerPort: 8080, protocol: consts.tcpTransport }],
                                },
                            ],
                        },
                    },
                },
            },
            { provider: config.k8sProvider }
        );

        new k8s.core.v1.Service(
            svcName,
            {
                metadata: {
                    name: svcName,
                    labels: { app: appName },
                    namespace: namespace.metadata.name,
                },
                spec: {
                    ports: [{ port: 8080, targetPort: 8080, protocol: consts.tcpTransport }],
                    selector: { app: appName },
                },
            },
            { provider: config.k8sProvider, dependsOn: [deployment] }
        );
        
        const exposePublicly: boolean = false;
        if (exposePublicly){
            const hostRecord = new network.RecordSet(`${appName}-${env}-${consts.aRecordPostFix}`, {
                relativeRecordSetName: `${appName}`,
                zoneName: config.zoneName,
                recordType: "A",
                resourceGroupName: config.zoneResourceGroupName,
                ttl: 600,
                aRecords: [{ ipv4Address: ingressConfiguration.ipAddress }],
            });

            const ingressRules = [
                {
                    host: pulumi.interpolate`${hostRecord.name}.${config.zoneName}`,
                    http: {
                        paths: [
                            {
                                path: "/",
                                pathType: "Prefix",
                                backend: {
                                    service: {
                                        name: svcName,
                                        port: {
                                            number: 8080,
                                        },
                                    },
                                },
                            },
                        ],
                    },
                },
            ];
            const host = `${appName}.${config.BaseUrl()}`;
            pulumi.log.info(`Kuard host url is ${host}`);
            pulumi.log.info(`IsLowers is ${config.isLowers}`);

            const tlsHosts = [host];
            const ingressName = `${appName}${consts.ingressPostfix}`;

            const options: k8s.networking.v1.IngressArgs = {
            metadata: {
                name: ingressName,
                annotations: {
                    "cert-manager.io/cluster-issuer": ingressConfiguration.certManagerIssuer, // <-- consider your rate limits,
                    "acme.cert-manager.io/http01-edit-in-place": "true",
                    "traefik.ingress.kubernetes.io/router.tls": "true",
                    "traefik.ingress.kubernetes.io/router.entrypoints": "web,websecure",
                },
                namespace: namespace.metadata.name,
                labels: ingressConfiguration.getSolverLabels(),
            },
            spec: {
                tls: [
                    {
                        hosts: tlsHosts,
                        secretName: pulumi.interpolate`${namespace.metadata.name}-${appName}${consts.tlsSecretNamePostfix}`,
                    },
                ],
                rules: ingressRules,
                ingressClassName: ingressConfiguration.ingressClass,
            },
            };

            new k8s.networking.v1.Ingress(ingressName, options, { provider: config.k8sProvider });
        }
    }
};