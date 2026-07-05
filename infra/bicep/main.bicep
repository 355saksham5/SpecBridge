@description('Azure region for all resources')
param location string = resourceGroup().location

@description('Environment suffix, e.g. dev or prod')
param environmentName string = 'dev'

@description('PostgreSQL admin login — use Key Vault reference in production')
@secure()
param postgresAdminPassword string

@description('Fully-qualified API container image, e.g. myregistry.azurecr.io/specbridge-api:1.0.0. Build and push this image (apps/api) before deploying — it is not provisioned by this template.')
param apiImage string

@description('Fully-qualified knowledge-worker container image, e.g. myregistry.azurecr.io/specbridge-worker:1.0.0. Build and push this image (apps/knowledge-worker) before deploying — it is not provisioned by this template.')
param workerImage string

@description('Entra ID (Azure AD) app registration client ID used to validate API JWTs. Create this registration manually first — see docs/DEPLOYMENT.md.')
param entraClientId string

@description('Entra ID tenant ID')
param entraTenantId string

@description('Entra ID API audience, e.g. api://specbridge')
param entraAudience string

@description('Shared secret the worker uses to authenticate internal event/credential-resolve calls to the API. Must match SPECBRIDGE_Internal__EventsApiKey. Minimum 32 characters.')
@secure()
@minLength(32)
param internalEventsApiKey string

var namePrefix = 'specbridge-${environmentName}'
var tags = {
  project: 'specbridge'
  environment: environmentName
  managedBy: 'bicep'
}

// Built-in "Key Vault Secrets User" role — grants read-only access to secret values.
var keyVaultSecretsUserRoleId = '4633458b-17de-408a-b874-0445c86b69e6'

// --- Observability ---
resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: '${namePrefix}-logs'
  location: location
  tags: tags
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: '${namePrefix}-ai'
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
  }
}

// --- Messaging ---
resource serviceBusNamespace 'Microsoft.ServiceBus/namespaces@2022-10-01-preview' = {
  name: '${namePrefix}-sb'
  location: location
  tags: tags
  sku: {
    name: 'Standard'
    tier: 'Standard'
  }
  properties: {
    minimumTlsVersion: '1.2'
  }
}

resource jobsQueue 'Microsoft.ServiceBus/namespaces/queues@2022-10-01-preview' = {
  parent: serviceBusNamespace
  name: 'brownfield-jobs'
  properties: {
    maxDeliveryCount: 5
    lockDuration: 'PT5M'
    enablePartitioning: false
  }
}

// --- Storage (artifact bundles) ---
resource storage 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: replace('${namePrefix}store', '-', '')
  location: location
  tags: tags
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    allowBlobPublicAccess: false
  }
}

resource blobServices 'Microsoft.Storage/storageAccounts/blobServices@2023-01-01' = {
  parent: storage
  name: 'default'
}

resource blobContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  parent: blobServices
  name: 'bundles'
  properties: {
    publicAccess: 'None'
  }
}

var storageConnectionString = 'DefaultEndpointsProtocol=https;AccountName=${storage.name};AccountKey=${storage.listKeys().keys[0].value};EndpointSuffix=core.windows.net'

// --- Secrets ---
resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: '${namePrefix}-kv'
  location: location
  tags: tags
  properties: {
    tenantId: subscription().tenantId
    sku: { family: 'A', name: 'standard' }
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
  }
}

// --- Database ---
resource postgres 'Microsoft.DBforPostgreSQL/flexibleServers@2023-06-01-preview' = {
  name: '${namePrefix}-pg'
  location: location
  tags: tags
  sku: {
    name: 'Standard_B1ms'
    tier: 'Burstable'
  }
  properties: {
    version: '16'
    administratorLogin: 'specbridgeadmin'
    administratorLoginPassword: postgresAdminPassword
    storage: { storageSizeGB: 32 }
    backup: { backupRetentionDays: 7, geoRedundantBackup: 'Disabled' }
    highAvailability: { mode: 'Disabled' }
  }
}

resource postgresDb 'Microsoft.DBforPostgreSQL/flexibleServers/databases@2023-06-01-preview' = {
  parent: postgres
  name: 'specbridge'
}

var postgresConnectionString = 'Host=${postgres.properties.fullyQualifiedDomainName};Database=specbridge;Username=specbridgeadmin;Password=${postgresAdminPassword};SSL Mode=Require'

// --- Container Apps ---
resource containerAppsEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: '${namePrefix}-cae'
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

resource apiApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${namePrefix}-api'
  location: location
  tags: tags
  identity: { type: 'SystemAssigned' }
  properties: {
    managedEnvironmentId: containerAppsEnv.id
    configuration: {
      ingress: {
        external: true
        targetPort: 8080
        transport: 'auto'
      }
      secrets: [
        {
          name: 'servicebus-connection'
          value: listKeys('${serviceBusNamespace.id}/AuthorizationRules/RootManageSharedAccessKey', serviceBusNamespace.apiVersion).primaryConnectionString
        }
        {
          name: 'postgres-connection'
          value: postgresConnectionString
        }
        {
          name: 'blob-connection'
          value: storageConnectionString
        }
        {
          name: 'internal-events-api-key'
          value: internalEventsApiKey
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'api'
          image: apiImage
          resources: { cpu: json('0.5'), memory: '1Gi' }
          env: [
            { name: 'SPECBRIDGE_Azure__ServiceBus__ConnectionString', secretRef: 'servicebus-connection' }
            { name: 'SPECBRIDGE_Azure__ServiceBus__QueueName', value: jobsQueue.name }
            { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsights.properties.ConnectionString }
            { name: 'SPECBRIDGE_ApplicationInsights__ConnectionString', value: appInsights.properties.ConnectionString }
            { name: 'SPECBRIDGE_ConnectionStrings__PostgreSQL', secretRef: 'postgres-connection' }
            { name: 'SPECBRIDGE_Azure__KeyVaultUri', value: keyVault.properties.vaultUri }
            { name: 'SPECBRIDGE_Azure__BlobConnectionString', secretRef: 'blob-connection' }
            { name: 'SPECBRIDGE_Azure__ContainerName', value: blobContainer.name }
            { name: 'SPECBRIDGE_EntraId__ClientId', value: entraClientId }
            { name: 'SPECBRIDGE_EntraId__TenantId', value: entraTenantId }
            { name: 'SPECBRIDGE_EntraId__Audience', value: entraAudience }
            { name: 'SPECBRIDGE_Internal__EventsApiKey', secretRef: 'internal-events-api-key' }
          ]
        }
      ]
      scale: { minReplicas: 1, maxReplicas: 3 }
    }
  }
}

// The API is the only component that reads secrets directly from Key Vault
// (WorkerCredentialService, IntegrationsService, AtlassianOAuthService). The worker never
// talks to Key Vault — it resolves credentials through the API's internal endpoint instead —
// so only the API's managed identity is granted access here (least privilege).
resource apiKeyVaultAccess 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, apiApp.id, keyVaultSecretsUserRoleId)
  scope: keyVault
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', keyVaultSecretsUserRoleId)
    principalId: apiApp.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

resource workerApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: '${namePrefix}-worker'
  location: location
  tags: tags
  identity: { type: 'SystemAssigned' }
  properties: {
    managedEnvironmentId: containerAppsEnv.id
    configuration: {
      secrets: [
        {
          name: 'servicebus-connection'
          value: listKeys('${serviceBusNamespace.id}/AuthorizationRules/RootManageSharedAccessKey', serviceBusNamespace.apiVersion).primaryConnectionString
        }
        {
          name: 'blob-connection'
          value: storageConnectionString
        }
        {
          name: 'internal-events-api-key'
          value: internalEventsApiKey
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'worker'
          image: workerImage
          resources: { cpu: json('1.0'), memory: '2Gi' }
          env: [
            { name: 'SPECBRIDGE_SERVICE_BUS_CONNECTION', secretRef: 'servicebus-connection' }
            { name: 'SPECBRIDGE_SERVICE_BUS_QUEUE', value: jobsQueue.name }
            { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsights.properties.ConnectionString }
            { name: 'SPECBRIDGE_ApplicationInsights__ConnectionString', value: appInsights.properties.ConnectionString }
            { name: 'SPECBRIDGE_API_BASE_URL', value: 'https://${apiApp.properties.configuration.ingress.fqdn}' }
            { name: 'SPECBRIDGE_EVENTS_API_KEY', secretRef: 'internal-events-api-key' }
            { name: 'SPECBRIDGE_BLOB_CONNECTION_STRING', secretRef: 'blob-connection' }
            { name: 'SPECBRIDGE_BLOB_CONTAINER', value: blobContainer.name }
          ]
          command: ['node', 'dist/service-bus-consumer.js']
        }
      ]
      scale: { minReplicas: 1, maxReplicas: 5 }
    }
  }
}

output appInsightsConnectionString string = appInsights.properties.ConnectionString
output serviceBusNamespace string = serviceBusNamespace.name
output storageAccountName string = storage.name
output keyVaultName string = keyVault.name
output keyVaultUri string = keyVault.properties.vaultUri
output apiUrl string = 'https://${apiApp.properties.configuration.ingress.fqdn}'
