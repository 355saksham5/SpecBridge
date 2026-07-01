using SpecBridge.Api.Contracts;
using SpecBridge.Api.Data.Entities;
using SpecBridge.Api.Services;

namespace SpecBridge.Api.Endpoints;

public static class IntegrationEndpoints
{
    public static void MapIntegrationEndpoints(this WebApplication app)
    {
        app.MapPut("/v1/integrations/cursor", async (
            PutCursorCredentialRequest request,
            IntegrationsService integrations,
            CancellationToken cancellationToken) =>
        {
            var (credential, errors, statusCode, detail) =
                await integrations.PutCursorCredentialAsync(request, cancellationToken);

            if (errors is not null)
            {
                return Results.ValidationProblem(errors, statusCode: statusCode);
            }

            if (credential is null)
            {
                return Results.Json(new { title = "Unavailable", detail }, statusCode: statusCode);
            }

            return Results.Ok(MapCursorCredential(credential));
        })
        .RequireAuthorization()
        .WithTags("Integrations");

        app.MapDelete("/v1/integrations/cursor/{id:guid}", async (
            Guid id,
            IntegrationsService integrations,
            CancellationToken cancellationToken) =>
        {
            var statusCode = await integrations.DeleteCursorCredentialAsync(id, cancellationToken);
            return statusCode switch
            {
                StatusCodes.Status204NoContent => Results.NoContent(),
                StatusCodes.Status403Forbidden => Results.Json(
                    new { title = "Forbidden", detail = "Missing org_id claim." },
                    statusCode: statusCode),
                _ => Results.NotFound(new { title = "Not found", detail = "Credential not found." }),
            };
        })
        .RequireAuthorization()
        .WithTags("Integrations");

        app.MapPost("/v1/integrations/github/install", async (
            InstallGitHubRequest request,
            IntegrationsService integrations,
            CancellationToken cancellationToken) =>
        {
            var (connection, errors, statusCode) =
                await integrations.InstallGitHubAsync(request, cancellationToken);

            if (errors is not null)
            {
                return Results.ValidationProblem(errors, statusCode: statusCode);
            }

            return Results.Created("/v1/integrations/github", MapGitHubConnection(connection!));
        })
        .RequireAuthorization()
        .WithTags("Integrations");

        app.MapGet("/v1/integrations/github", async (
            IntegrationsService integrations,
            CancellationToken cancellationToken) =>
        {
            var (connections, statusCode) = await integrations.ListGitHubConnectionsAsync(cancellationToken);
            if (statusCode == StatusCodes.Status403Forbidden)
            {
                return Results.Json(
                    new { title = "Forbidden", detail = "Missing org_id claim." },
                    statusCode: statusCode);
            }

            return Results.Ok(new
            {
                connections = connections.Select(MapGitHubConnection).ToArray(),
            });
        })
        .RequireAuthorization()
        .WithTags("Integrations");

        app.MapPost("/v1/integrations/jira/connect", async (
            ConnectAtlassianRequest request,
            IntegrationsService integrations,
            CancellationToken cancellationToken) =>
        {
            var (connection, errors, statusCode, detail) =
                await integrations.ConnectJiraAsync(request, cancellationToken);

            if (errors is not null)
            {
                return Results.ValidationProblem(errors, statusCode: statusCode);
            }

            if (connection is null)
            {
                return Results.Json(new { title = "Unavailable", detail }, statusCode: statusCode);
            }

            return Results.Created("/v1/integrations/jira/connect", MapJiraConnection(connection));
        })
        .RequireAuthorization()
        .WithTags("Integrations");

        app.MapPost("/v1/integrations/confluence/connect", async (
            ConnectAtlassianRequest request,
            IntegrationsService integrations,
            CancellationToken cancellationToken) =>
        {
            var (connection, errors, statusCode, detail) =
                await integrations.ConnectConfluenceAsync(request, cancellationToken);

            if (errors is not null)
            {
                return Results.ValidationProblem(errors, statusCode: statusCode);
            }

            if (connection is null)
            {
                return Results.Json(new { title = "Unavailable", detail }, statusCode: statusCode);
            }

            return Results.Created("/v1/integrations/confluence/connect", MapConfluenceConnection(connection));
        })
        .RequireAuthorization()
        .WithTags("Integrations");
    }

    public static void MapSddKitEndpoints(this WebApplication app)
    {
        app.MapGet("/v1/sdd-kits", (SddKitRegistry registry) => Results.Ok(new
        {
            kits = registry.List().Select(k => new
            {
                k.Id,
                k.Version,
                k.IsDefault,
                k.Description,
            }),
        }))
        .RequireAuthorization()
        .WithTags("SDD Kits");

        app.MapGet("/v1/sdd-kits/{kitId}", (string kitId, SddKitRegistry registry) =>
        {
            var kit = registry.Get(kitId);
            return kit is null
                ? Results.NotFound(new { title = "Not found", detail = $"Kit '{kitId}' is not registered." })
                : Results.Ok(new
                {
                    kit.Id,
                    kit.Version,
                    kit.IsDefault,
                    kit.Description,
                    manifestHash = kit.ManifestHash,
                    fileCount = kit.FileCount,
                });
        })
        .RequireAuthorization()
        .WithTags("SDD Kits");
    }

    private static object MapCursorCredential(CursorCredential c) => new
    {
        id = c.Id,
        organizationId = c.OrganizationId,
        name = c.Name,
        last4 = c.Last4,
        createdAt = c.CreatedAt,
    };

    private static object MapGitHubConnection(GitHubConnection g) => new
    {
        id = g.Id,
        organizationId = g.OrganizationId,
        hostType = g.HostType,
        webUrl = g.WebUrl,
        apiBaseUrl = g.ApiBaseUrl,
        installationId = g.InstallationId,
        createdAt = g.CreatedAt,
    };

    private static object MapJiraConnection(JiraConnection j) => new
    {
        id = j.Id,
        organizationId = j.OrganizationId,
        baseUrl = j.BaseUrl,
        createdAt = j.CreatedAt,
    };

    private static object MapConfluenceConnection(ConfluenceConnection c) => new
    {
        id = c.Id,
        organizationId = c.OrganizationId,
        baseUrl = c.BaseUrl,
        createdAt = c.CreatedAt,
    };
}
