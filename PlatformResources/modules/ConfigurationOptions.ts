import * as pulumi from "@pulumi/pulumi";
import * as k8s from "@pulumi/kubernetes";
import * as consts from "./Consts";

export class ConfigurationOptions {
    public readonly k8sProvider: k8s.Provider;
    public readonly zoneName: pulumi.Output<any>;
    public readonly zoneResourceGroupName: pulumi.Output<string>;
    public readonly envName: string;
    public readonly isLowers: boolean;
    public readonly isShared: boolean;
    //public readonly keyVaultAdminGroupUUID: string;
    public readonly acrCredentials: pulumi.Output<any>;

    public constructor(provider: k8s.Provider, 
                       zoneName: pulumi.Output<any>, 
                       zoneResourceGroupName: pulumi.Output<string>,
                       envName:string,
                       isLowers: boolean,
                       isShared: boolean,
                       //keyVaultAdminGroupUUID: string,
                       acrCredentials: pulumi.Output<any>){
        this.k8sProvider = provider;
        this.zoneName = zoneName;
        this.zoneResourceGroupName = zoneResourceGroupName;
        this.envName = envName;
        this.isLowers = isLowers;
        this.isShared = isShared;
        //this.keyVaultAdminGroupUUID = keyVaultAdminGroupUUID;
        this.acrCredentials = acrCredentials;
    };
    
    public BaseUrl():string {
        return this.isLowers ? consts.baseLowersDomain : consts.baseProdDomain;
    }
};
export class IngressConfiguration {
    public readonly isPublic: boolean;
    public readonly ipAddress: pulumi.Output<string>;
    public readonly cName: string;
    public readonly ingressClass: string;
    public certManagerIssuer: string = consts.leStagingIssuer;

    public constructor(isPublic: boolean, ipAddress: pulumi.Output<string>, cName: string, ingresClass: string){
        this.isPublic = isPublic;
        this.ipAddress = ipAddress;
        this.cName = cName;
        this.ingressClass = ingresClass;
    };

    public getSolverLabels(): any {
        return this.isPublic ?  {...{"use-http01-solver":"true"}} : {...{"use-dns01-solver":"true"}}
    }
};