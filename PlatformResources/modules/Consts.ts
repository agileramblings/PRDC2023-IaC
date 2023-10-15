export const dnsNameLabelSuffix: string = "-k8s-cwd";
export const cnameUrlSuffix: string = ".cloudapp.azure.com";
export const tcpTransport: string = "TCP";
export const udpTransport: string = "UDP";
export const storageClassDefault: string = "default";
export const storageClassManagedPremium: string = "managed-premium";

export const svcPostfix: string = "-svc";
export const ingressPostfix: string = "-ingress";
export const deploymentPostfix: string = "-dep";
export const tlsSecretNamePostfix: string = "-tls-secret-certificate";
export const pvcPostfix:string ="-pvc";

export const cNameRecordPostfix: string = "DnsCnameRecord";
export const aRecordPostFix: string = "DnsARecord";
export const leStagingIssuer:string = "letsencrypt-staging";
export const leProductionIssuer:string = "letsencrypt-prod";
export const pvcAccessModeRWO = "ReadWriteOnce";
export const deploymentStrategyRecreate = "Recreate";
export const deploymentStrategyRollingUpdate = "RollingUpdate";

export const rgShareAzureResourcesPrefix = "rg-csl-shared-";

// Common labels
export const baseBackEndLabels = { group: "infrastructure" };
export const baseApplicationGroupLabels = { group:"application" };

export const cloudnotificationEmailAddress = "cloudnotifications@codingwithdave.xyz";

export const baseLowersDomain = "lowers.codingwithdave.xyz";
export const baseProdDomain = "platform.codingwithdave.xyz";

