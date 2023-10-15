import * as pulumi from "@pulumi/pulumi";
import * as resources from "@pulumi/azure-native/resources";
import * as containerservice from "@pulumi/azure-native/containerservice";
import * as k8s from "@pulumi/kubernetes";
import * as azuread from "@pulumi/azuread";
import * as tls from "@pulumi/tls";

interface AgentPoolProfile {
    name: string;
    size: string;
    count: number;
}

const env = pulumi.getStack(); // reference to this stack
const config = new pulumi.Config("kubernetes-cluster");
const azureConfig = new pulumi.Config("azure-native");
const profiles = config.requireObject<AgentPoolProfile[]>("agentPoolProfiles");

// create an azure active directory application for the AKS Service to run under
const aadApp = new azuread.Application(`aad-aks-app-${env}`, { displayName: `aad-aks-app-${env}` });
const aadSp = new azuread.ServicePrincipal(`aad-aks-sp-${env}`, { applicationId: aadApp.applicationId }, { dependsOn: [aadApp] });
const spp = new azuread.ServicePrincipalPassword(`aks-sp-pwd-${env}`, {
        servicePrincipalId: aadSp.id,
        displayName: `aks-sp-pwd-${env}`,
        endDate: "2099-01-01T00:00:00Z",
    },{ dependsOn: [aadSp] }
);

// Create an Azure Resource Group that will hold the AKS Service
const rgName = `rg-aks-${env}`;
const aksRg = new resources.ResourceGroup(rgName, {
    resourceGroupName: rgName
});

// Generate an SSH key for remoting into the cluster nodes as necessary
const sshKey = new tls.PrivateKey(`tls-akscluster-${env}-sshkey`, {
    algorithm: "RSA",
    rsaBits: 4096,
});

// create k8s cluster
const baseClusterName = `aks-${env}`;
const kubernetesVersion = config.require("kubernetesVersion");

const apps = profiles.map((p) => {
    return {
        name: p.name,
        mode: containerservice.AgentPoolMode.System,
        orchestratorVersion: kubernetesVersion,
        osType: containerservice.OSType.Linux,
        type: containerservice.AgentPoolType.VirtualMachineScaleSets,
        enableAutoScaling: true,
        count: p.count,
        minCount: p.count,
        maxCount: 10,
        vmSize: p.size,
    };
});

const k8sCluster = new containerservice.ManagedCluster(
    baseClusterName,
    {
        resourceName: baseClusterName,
        location: azureConfig.get("location"),
        resourceGroupName: aksRg.name,
        nodeResourceGroup: pulumi.interpolate`${aksRg.name}-nodes-${env}`,
        kubernetesVersion: kubernetesVersion,
        agentPoolProfiles: apps,
        autoScalerProfile: {
            scaleDownDelayAfterAdd: "15m",
            scanInterval: "20s",
        },
        dnsPrefix: `${env}-prdc2023-kube`,
        linuxProfile: {
            adminUsername: "aksuser",
            ssh: {
                publicKeys: [{ keyData: sshKey.publicKeyOpenssh }],
            },
        },
        servicePrincipalProfile: {
            clientId: aadApp.applicationId,
            secret: spp.value,
        },
        addonProfiles: {
            azurePolicy: {
                enabled: true,
            },
        },
        sku: {
            name: containerservice.ManagedClusterSKUName.Base,
            tier: containerservice.ManagedClusterSKUTier.Free,
        },
    }, { dependsOn: [spp] }
);

const creds = pulumi.all([k8sCluster.name, aksRg.name]).apply(([clusterName, rgName]) => {
    return containerservice.listManagedClusterUserCredentials({
        resourceGroupName: rgName,
        resourceName: clusterName,
    });
});

const encoded = creds.kubeconfigs[0].value;
//export const kubeEndpoint = k8sCluster.privateClusterEnabled;
export const kubeconfig = encoded.apply((enc) => Buffer.from(enc, "base64").toString());
const k8sProvider = new k8s.Provider("aksK8s", { kubeconfig: kubeconfig });

export const clusterName = k8sCluster.name;
export const clusterId = k8sCluster.id;
export const kubeCtrlCredentialsCommand = pulumi.interpolate`az aks get-credentials --resource-group ${aksRg.name} --name ${clusterName} --context ${env}-prdc2023 --admin`;
export const aadSPPassword = spp.value;