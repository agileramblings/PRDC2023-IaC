import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import * as cfg from "./modules/ConfigurationOptions";
import * as consts from "./modules/Consts";
import * as traefik from "./modules/TraefikExtInstaller";
import * as seq from "./modules/SeqInstaller";
import * as kuard from "./modules/KuardInstaller";
import * as certMgr from "./modules/CertManagerInstaller";

const env = pulumi.getStack(); // reference to this stack
const config = new pulumi.Config();

// this is common information for all services
const k8sStack = new pulumi.StackReference(`vigilance1022/KubernetesCluster/${env}`);
const sharedAssetsStack = `vigilance1022/shared-assets/all`;
const sharedInfra = new pulumi.StackReference(sharedAssetsStack);
const zoneName = sharedInfra.getOutput("platformZoneName");
const zoneResourceGroup = sharedInfra.getOutputValue("sharedAssetsResourceGroupName");

// This allows other applications to work with the k8s cluster
const k8sProvider = new k8s.Provider("aksK8s", { kubeconfig: k8sStack.requireOutput("kubeconfig") });

// Put all of the configuration information into a compact object
const installConfig = new cfg.ConfigurationOptions(k8sProvider, zoneName, pulumi.interpolate`${zoneResourceGroup}`, env, true, true,  pulumi.output({}));

// prepare to install core services into the cluster
var s: seq.SeqInstaller = { instantiated: false } as seq.SeqInstaller;
var k: kuard.KuardInstaller = { instantiated: false } as kuard.KuardInstaller;
const cm = new certMgr.CertManagerInstaller(`cert-manager-installer-${env}`, installConfig);
//var publicIngress: traefik.TraefikExtIngressController = { instantiated: false } as traefik.TraefikExtIngressController;

//publicIngress = new traefik.TraefikExtIngressController(`traefik-ext-installer-${env}`, installConfig);
//publicIngress.ingressConfiguration.certManagerIssuer = config.get("letsEncryptClusterIssuer") || consts.leStagingIssuer;
//k = new kuard.KuardInstaller(`kuard-installer-${env}`, installConfig, publicIngress.ingressConfiguration);
//s = new seq.SeqInstaller(`seq-installer-${env}`, installConfig, publicIngress.ingressConfiguration);
//export const traefikPublicLoadBalancerIpAddress = publicIngress.instantiated ? publicIngress.ingressConfiguration.ipAddress : null;