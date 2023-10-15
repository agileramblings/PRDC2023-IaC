# Getting Started with Pulumi and IaC

## Create a Pulumi account
1. Head to [Pulumi.com](https://www.pulumi.com/https://www.pulumi.com/) and create an account
- For now, just create using an Individual price tier (free)
2. (Optional) Create a Personal Access Token 
- This will allow us to use Pulumi from a pipeline that is _not_ going to be able to run "as you" on the task runner
3. Visit your dashboard and get familiar with your platform account

## Install the Pulumi cli tooling 
The best place to get started with this is at [Pulumi.com/get-started](https://www.pulumi.com/docs/get-started/). Pick your cloud provider examples to get the most relevant advice and guidance.

`choco install pulumi`

> You may need to install a language run-time (Node, .NET, golang, etc) in order to use your pulumi language sdk of choice (TypeScript, C#, Go, etc)

### Log in to Pulumi with the pulumi CLI

Since pulumi has a central service for managing a bunch of state, the pulumi cli tooling needs to log into this platform. 

## Log into your cloud provider 

Pulumi needs permission to act within your cloud provider. It will "assume" your ambient permissions.  For Azure, this means doing an `az login` with the Azure CLI tooling.

> You may want to create a service principal to represent your pulumi activities. You will need this if you are going to use Pulumi in your CI/CD pipelines.

## Create a git repository (or your version control tool of choice

```powershell
$ mkdir getting-started-with-iac && cd getting-started-with-iac
$ git init
$ git remote add origin -f https://github.com/agileramblings/PRDC2023-IaC
```

## Set an environmental variable for the pulumi secret provider passphrase

```powershell
[System.Environment]::SetEnvironmentVariable('PULUMI_CONFIG_PASSPHRASE','89b8d984-464d-4b3c-9c2a-916caa4474d8') // Some random guid (private secret)
[System.Environment]::SetEnvironmentVariable('PULUMI_K8S_SUPPRESS_HELM_HOOK_WARNINGS', 'TRUE')
```
If you do not do this, you will be asked for a passphrase when trying to create the new pulumi project. We will need secrets during the provisioning of our shared platform resources.

We've also suppressed a warning that we don't need to see right now.

 ## Create a new pulumi project

```bash
mkdir src && cd src
mkdir SharedAssets && cd SharedAssets
pulumi new azure-typescript --secrets-provider passphrase
```

 > If you are using a different cloud provider or language SDK, please use that combination in the `new` command as appropriate.

Enter values that make sense for your region and needs. These are sample values I've used.

```powershell
 project name: SharedAssets
 project description: An application to deploy cloud resources that are shared amonst multiple platform resources
 stack name (dev): dev
 azure-native:location: CentralCanada 
```
 Then use the `pulumi up` cli command to ensure that everything is working. This will create a resource group and a storage account in your Azure subscription if everything is working as expected.

 When this test is completed, do a `pulumi destroy -y` to remove all of the cloud resources that have been created.

 > If you want to remove a stack completely (all configuration and history) you can use the `pulumi stack rm dev` command and follow the prompts. You can then re-create a stack wit the name `dev` in this pulumi project to start over. **Warning** This removes all previous configuration values like name, location, etc and you may need to re-enter these manually.

## adding some customer configuration values to this stack

`pulumi config set conference prdc2023-regina`

## Add a Configuration for the expected base zone

`pulumi config set shared-assets:platformZone lowers.programmingwithdave.xyz`

## Creating our Expected Cloud Resources

Now that we know Pulumi works, we are going to start building our actual platform for our dev environment.