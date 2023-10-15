import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import * as network from "@pulumi/azure-native/network";
import * as cfg from "./ConfigurationOptions";
import * as consts from "./Consts";
import { ComponentResource } from "@pulumi/pulumi";

const defaultNamespaceName = "logging";
const env = pulumi.getStack();

const appName = "seq";
const svcName = `${appName}${consts.svcPostfix}`;
const imageName = "datalust/seq:2023.1";

const seqGelfAppName = "squelf";
const seqGelfSideCarImageName = "datalust/seq-input-gelf:2";

const baseLabels = {
    ...{ app: appName, role: "logging" },
    ...consts.baseBackEndLabels,
};

export class SeqInstaller extends ComponentResource {
    public readonly instantiated: boolean;

    constructor(
        name: string,
        config: cfg.ConfigurationOptions,
        ingressConfiguration: cfg.IngressConfiguration,
        opts?: pulumi.ResourceOptions
    ) {
        const inputs: pulumi.Inputs = {
            options: opts,
        };
        super("pulumi-contrib:components:SeqInstaller", name, inputs, opts);
        this.instantiated = true;

        const seqUrlUi = `seq.${config.BaseUrl()}`;
        var memoryRequestLimit: string = "";
        var cpuRequestLimit: string = "";
        var diskSize: string = "";
        var storageClass: string = "";

        // Primary instance size
        memoryRequestLimit = "8Gi";
        cpuRequestLimit = "1000m";
        diskSize = "1000Gi";
        storageClass = consts.storageClassManagedPremium;

        var namespace = new k8s.core.v1.Namespace(
            defaultNamespaceName,
            {
                metadata: {
                    name: defaultNamespaceName,
                },
            },
            { provider: config.k8sProvider }
        );

        var claim = new k8s.core.v1.PersistentVolumeClaim(
            `${appName}${consts.pvcPostfix}`,
            {
                metadata: {
                    name: `${appName}${consts.pvcPostfix}`,
                    namespace: namespace.metadata.name,
                },
                spec: {
                    accessModes: [consts.pvcAccessModeRWO],
                    storageClassName: storageClass,
                    resources: {
                        requests: { storage: diskSize },
                    },
                },
            },
            { provider: config.k8sProvider }
        );

        var deployment = new k8s.apps.v1.Deployment(
            `${appName}${consts.deploymentPostfix}`,
            {
                metadata: {
                    name: appName,
                    labels: baseLabels,
                    namespace: namespace.metadata.name,
                },
                spec: {
                    selector: { matchLabels: baseLabels },
                    replicas: 1,
                    revisionHistoryLimit: 2,
                    strategy: {
                        type: consts.deploymentStrategyRecreate,
                    },
                    template: {
                        metadata: { labels: baseLabels },
                        spec: {
                            volumes: [
                                {
                                    name: "data",
                                    persistentVolumeClaim: { claimName: claim.metadata.name },
                                },
                                { name: "tmp", emptyDir: {} }, //enables readonly root filesystem if /tmp is mounted to this
                                { name: "squelf-tmp", emptyDir: {} }, //enables readonly root filesystem if /tmp is mounted to this
                            ],
                            containers: [
                                {
                                    // <-- Primary Container
                                    name: appName,
                                    image: imageName,
                                    securityContext: {
                                        readOnlyRootFilesystem: true,
                                        allowPrivilegeEscalation: false,
                                    },
                                    env: [
                                        { name: "ACCEPT_EULA", value: "Y" },
                                        { name: "BASE_URI", value: `https://${seqUrlUi}` },
                                        { name: "SEQ_CACHE_SYSTEMRAMTARGET", value: "0.9" },
                                        { name: "SEQ_STORAGE_SECRETKEY", value: "6edCs03s5/CY4JyMMjDMLSq+U1zgZLrtT9+A0932zKI=" }
                                    ],
                                    volumeMounts: [
                                        {
                                            name: "data",
                                            mountPath: "/data",
                                        },
                                        {
                                            name: "tmp",
                                            mountPath: "/tmp",
                                        },
                                    ],
                                    resources: {
                                        requests: {
                                            cpu: cpuRequestLimit,
                                            memory: memoryRequestLimit,
                                        },
                                        limits: {
                                            //cpu: cpuRequestLimit,
                                            memory: memoryRequestLimit,
                                        },
                                    },
                                    ports: [
                                        {
                                            name: "ui",
                                            containerPort: 80,
                                            protocol: consts.tcpTransport,
                                        },
                                        {
                                            name: "ingestion",
                                            containerPort: 5341,
                                            protocol: consts.tcpTransport,
                                        },
                                    ],
                                },
                                {
                                    // <-- Gelf Sidecar Container
                                    name: seqGelfAppName,
                                    image: seqGelfSideCarImageName,
                                    resources: {
                                        requests: {
                                            cpu: "200m",
                                            memory: "250Mi",
                                        },
                                        limits: {
                                            cpu: "200m",
                                            memory: "250Mi",
                                        },
                                    },
                                    securityContext: {
                                        readOnlyRootFilesystem: true,
                                        allowPrivilegeEscalation: false,
                                    },
                                    ports: [
                                        {
                                            name: "gelf-ingestion",
                                            containerPort: 12201,
                                            protocol: consts.udpTransport,
                                        },
                                    ],
                                    volumeMounts: [
                                        {
                                            name: "squelf-tmp",
                                            mountPath: "/tmp",
                                        },
                                    ],
                                    env: [
                                        { name: "ACCEPT_EULA", value: "Y" },
                                        { name: "SEQ_ADDRESS", value: `http://localhost:5341` },
                                    ],
                                },
                            ],
                        },
                    },
                },
            },
            { provider: config.k8sProvider, dependsOn: [claim] }
        );

        // ingestion svc exposed on internal lb
        var svc = new k8s.core.v1.Service(`${svcName}`, {
            metadata: {
                name: `${svcName}`,
                labels: baseLabels,
                namespace: namespace.metadata.name,
            },
            spec: {
                ports: [
                    {
                        name: "http-ui",
                        port: 80,
                        targetPort: 80,
                        protocol: consts.tcpTransport,
                    },
                    {
                        name: "http-ingestion",
                        port: 5341,
                        targetPort: 5341,
                        protocol: consts.tcpTransport,
                    },
                    {
                        name: "gelf-ingestion",
                        port: 12201,
                        targetPort: 12201,
                        protocol: consts.udpTransport,
                    }
                ],
                selector: baseLabels,
            },
        },
            { provider: config.k8sProvider, dependsOn: [deployment] }
        );



        const uiUri = new network.RecordSet(`${appName}-${env}-${consts.aRecordPostFix}`, {
            relativeRecordSetName: config.isShared ? "seq" : `${env}.seq`,
            zoneName: config.zoneName,
            recordType: "A",
            resourceGroupName: config.zoneResourceGroupName,
            ttl: 600,
            aRecords: [{ ipv4Address: ingressConfiguration.ipAddress }],
        });

        const ingestionUri = new network.RecordSet(`${appName}-ingestion-${env}-${consts.aRecordPostFix}`, {
            relativeRecordSetName: config.isShared ? "seq-ingestion" : `${env}.seq-ingestion`,
            zoneName: config.zoneName,
            recordType: "A",
            resourceGroupName: config.zoneResourceGroupName,
            ttl: 600,
            aRecords: [{ ipv4Address: ingressConfiguration.ipAddress }],
        });



        this.deploySecureIngress([ pulumi.interpolate`${uiUri.name}.${config.zoneName}` ], 
                                 [ pulumi.interpolate`${ingestionUri.name}.${config.zoneName}` ], 
                                 namespace, 
                                 ingressConfiguration, 
                                 config.k8sProvider, 
                                 `${appName}${consts.ingressPostfix}`);
    }


    deploySecureIngress(hosts: pulumi.Output<string>[], dataHosts: pulumi.Output<string>[], namespace: k8s.core.v1.Namespace, ingressConfiguration: cfg.IngressConfiguration, provider: k8s.Provider, ingressName: string) {
        const ingressRules: k8s.types.input.networking.v1.IngressRule[] = [];
        hosts.forEach(host => {
            ingressRules.push(
                {
                    host: host,
                    http: {
                        paths: [
                            {
                                path: "/",
                                pathType: "Prefix",
                                backend: {
                                    service: {
                                        name: svcName,
                                        port: { number: 80 }
                                    },
                                },
                            },
                        ],
                    },
                },
            )
        });

        dataHosts.forEach(host => {
            ingressRules.push(
                {
                    host: host,
                    http: {
                        paths: [
                            {
                                path: "/",
                                pathType: "Prefix",
                                backend: {
                                    service: {
                                        name: svcName,
                                        port: { number: 5341 }
                                    },
                                },
                            },
                        ],
                    },
                },
            )
        });

        var tlsHosts = hosts.concat(dataHosts)
        const options: k8s.networking.v1.IngressArgs = {
            metadata: {
                name: ingressName,
                namespace: namespace.metadata.name,
                labels: ingressConfiguration.getSolverLabels(),
                annotations: {
                    "cert-manager.io/cluster-issuer": ingressConfiguration.certManagerIssuer, // <-- consider your rate limits,
                    "acme.cert-manager.io/http01-edit-in-place": "true",
                    "traefik.ingress.kubernetes.io/router.tls": "true",
                    "traefik.ingress.kubernetes.io/router.entrypoints": "web,websecure",
                },
            },
            spec: {
                tls: [
                    {
                        hosts: tlsHosts,
                        secretName: pulumi.interpolate`${defaultNamespaceName}-${appName}${consts.tlsSecretNamePostfix}`,
                    },
                ],
                rules: ingressRules,
                ingressClassName: ingressConfiguration.ingressClass,
            },
        };

        new k8s.networking.v1.Ingress(ingressName, options, { provider: provider });
    }
}
