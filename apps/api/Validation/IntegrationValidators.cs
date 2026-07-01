using FluentValidation;
using SpecBridge.Api.Contracts;

namespace SpecBridge.Api.Validation;

public sealed class PutCursorCredentialRequestValidator : AbstractValidator<PutCursorCredentialRequest>
{
    public PutCursorCredentialRequestValidator()
    {
        RuleFor(x => x.ApiKey)
            .NotEmpty()
            .MinimumLength(8)
            .MaximumLength(256);

        RuleFor(x => x.Name)
            .MaximumLength(128)
            .When(x => !string.IsNullOrEmpty(x.Name));
    }
}

public sealed class InstallGitHubRequestValidator : AbstractValidator<InstallGitHubRequest>
{
    public InstallGitHubRequestValidator()
    {
        RuleFor(x => x.InstallationId)
            .GreaterThan(0);

        RuleFor(x => x.WebUrl)
            .NotEmpty()
            .MaximumLength(2048)
            .Must(url => Uri.TryCreate(url, UriKind.Absolute, out var uri)
                         && uri.Scheme == Uri.UriSchemeHttps)
            .WithMessage("webUrl must be a valid HTTPS URL");

        RuleFor(x => x.ApiBaseUrl)
            .MaximumLength(2048)
            .Must(url => string.IsNullOrEmpty(url) || Uri.TryCreate(url, UriKind.Absolute, out _))
            .WithMessage("apiBaseUrl must be a valid absolute URL")
            .When(x => !string.IsNullOrEmpty(x.ApiBaseUrl));

        RuleFor(x => x.HostType)
            .Must(h => h is "github.com" or "ghes")
            .WithMessage("hostType must be github.com or ghes");

        RuleFor(x => x.InstallationToken)
            .MaximumLength(4096)
            .When(x => !string.IsNullOrEmpty(x.InstallationToken));
    }
}

public sealed class ConnectAtlassianRequestValidator : AbstractValidator<ConnectAtlassianRequest>
{
    public ConnectAtlassianRequestValidator()
    {
        RuleFor(x => x.Code)
            .NotEmpty()
            .MaximumLength(2048);

        RuleFor(x => x.RedirectUri)
            .NotEmpty()
            .MaximumLength(2048)
            .Must(url => Uri.TryCreate(url, UriKind.Absolute, out _))
            .WithMessage("redirectUri must be a valid absolute URL");

        RuleFor(x => x.BaseUrl)
            .MaximumLength(2048)
            .Must(url => string.IsNullOrEmpty(url) || Uri.TryCreate(url, UriKind.Absolute, out _))
            .WithMessage("baseUrl must be a valid absolute URL")
            .When(x => !string.IsNullOrEmpty(x.BaseUrl));
    }
}

public sealed class ListJobsQueryValidator : AbstractValidator<ListJobsQuery>
{
    private static readonly HashSet<string> AllowedStatuses = new(StringComparer.OrdinalIgnoreCase)
    {
        "queued", "cloning", "stack_detect", "knowledge_bootstrap", "commit_walk",
        "validation", "bundle_packaging", "pr_opened", "completed", "failed", "cancelled",
    };

    public ListJobsQueryValidator()
    {
        RuleFor(x => x.Limit)
            .InclusiveBetween(1, 100);

        RuleFor(x => x.Status)
            .Must(s => s is null || AllowedStatuses.Contains(s))
            .WithMessage("status filter is not a recognized job status")
            .When(x => !string.IsNullOrEmpty(x.Status));

        RuleFor(x => x.RepoUrl)
            .MaximumLength(2048)
            .When(x => !string.IsNullOrEmpty(x.RepoUrl));

        RuleFor(x => x.Cursor)
            .MaximumLength(512)
            .When(x => !string.IsNullOrEmpty(x.Cursor));
    }
}
