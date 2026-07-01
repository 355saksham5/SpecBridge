@description('Azure region for all resources')
param location string = resourceGroup().location

@description('Environment suffix, e.g. dev or prod')
param environmentName string = 'dev'

@description('PostgreSQL admin login — use Key Vault reference in production')
@secure()
param postgresAdminPassword string

var namePrefix = 'specbridge-${environmentName}'
var tags = {
  project: 'specbridge'
  environment: environmentName
  managedBy: 'bicep'
}

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
      ]
    }
    template: {
      containers: [
        {
          name: 'api'
          image: 'mcr.microsoft.com/dotnet/samples:aspnetapp'
          resources: { cpu: json('0.5'), memory: '1Gi' }
          env: [
            { name: 'SPECBRIDGE_Azure__ServiceBus__ConnectionString', secretRef: 'servicebus-connection' }
            { name: 'SPECBRIDGE_Azure__ServiceBus__QueueName', value: jobsQueue.name }
            { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsights.properties.ConnectionString }
            { name: 'ConnectionStrings__PostgreSQL', value: 'Host=${postgres.properties.fullyQualifiedDomainName};Database=specbridge;Username=specbridgeadmin;Password=${postgresAdminPassword};SSL Mode=Require' }
          ]
        }
      ]
      scale: { minReplicas: 1, maxReplicas: 3 }
    }
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
      ]
    }
    template: {
      containers: [
        {
          name: 'worker'
          image: 'mcr.microsoft.com/dotnet/samples:aspnetapp'
          resources: { cpu: json('1.0'), memory: '2Gi' }
          env: [
            { name: 'SPECBRIDGE_SERVICE_BUS_CONNECTION', secretRef: 'servicebus-connection' }
            { name: 'SPECBRIDGE_SERVICE_BUS_QUEUE', value: jobsQueue.name }
            { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsights.properties.ConnectionString }
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
output apiUrl string = 'https://${apiApp.properties.configuration.ingress.fqdn}'
