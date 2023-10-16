import * as pulumi from "@pulumi/pulumi";
import * as resources from "@pulumi/azure-native/resources";
import * as network from "@pulumi/azure-native/network";
import * as containers from "@pulumi/azure-native/containerregistry";

const stackName = pulumi.getStack();
const config = new pulumi.Config();
const azureConfig = new pulumi.Config("azure-native");

// Create an Azure Resource Group
const rgName = `rg-prdc2023-shared`;
const resourceGroup = new resources.ResourceGroup(rgName, {
    resourceGroupName: rgName
});

// dns zone
const platformZoneConfigName = config.get<string>("platformZone");
const platformZone = new network.Zone(`dz-prdc2023`, {
    location: "Global",
    resourceGroupName: resourceGroup.name,
    tags: {
        environment: `${stackName}`,
    },
    zoneName: platformZoneConfigName,
    zoneType: "Public"
});

// Create an Azure Resource Group
const rgName2 = `rg-prdc2023-shared-demo`;
const resourceGroup2 = new resources.ResourceGroup(rgName2, {
    resourceGroupName: rgName2
});

export const sharedAssetsResourceGroupName = resourceGroup.name;
export const platformZoneName = platformZone.name;