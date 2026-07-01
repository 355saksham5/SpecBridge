using FluentValidation;
using SpecBridge.Api.Contracts;
using SpecBridge.Api.Services;

namespace SpecBridge.Api.Validation;

public sealed class CreateBrownfieldJobRequestValidator : AbstractValidator<CreateBrownfieldJobRequest>
{
    public CreateBrownfieldJobRequestValidator(GhesHostRegistry ghesHostRegistry)
    {
        RuleFor(x => x.RepoUrl)
            .NotEmpty()
            .MaximumLength(BrownfieldJobLimits.MaxRepoUrlLength)
            .Custom((repoUrl, context) =>
            {
                if (!RepoUrlValidation.TryParse(repoUrl, out var uri, out var parseError))
                {
                    context.AddFailure(parseError ?? "Invalid repoUrl");
                    return;
                }

                if (!ghesHostRegistry.IsAllowedHost(uri!.Host))
                {
                    context.AddFailure($"Host '{uri.Host}' is not github.com or a registered GHES host.");
                }
            });

        RuleFor(x => x.GitHubConnectionId)
            .NotEqual(Guid.Empty)
            .WithMessage("githubConnectionId is required");

        RuleFor(x => x.CursorCredentialId)
            .NotEqual(Guid.Empty)
            .WithMessage("cursorCredentialId is required");

        RuleFor(x => x.DefaultBranch)
            .MaximumLength(BrownfieldJobLimits.MaxBranchLength)
            .When(x => !string.IsNullOrEmpty(x.DefaultBranch));

        RuleFor(x => x.SddKitId)
            .NotEmpty()
            .MaximumLength(BrownfieldJobLimits.MaxSddKitIdLength);

        RuleFor(x => x.SddKitVersion)
            .MaximumLength(BrownfieldJobLimits.MaxSddKitVersionLength)
            .When(x => !string.IsNullOrEmpty(x.SddKitVersion));

        When(x => x.History is not null, () =>
        {
            RuleFor(x => x.History!.CommitDepth)
                .InclusiveBetween(BrownfieldJobLimits.MinCommitDepth, BrownfieldJobLimits.MaxCommitDepth);

            RuleFor(x => x.History!.WalkOrder)
                .Must(w => BrownfieldJobLimits.WalkOrders.Contains(w))
                .WithMessage("walkOrder must be oldest_first or newest_first");
        });

        When(x => x.Jira is not null, () =>
        {
            RuleFor(x => x.Jira!.IssueKeyPattern)
                .NotEmpty()
                .MaximumLength(BrownfieldJobLimits.MaxIssueKeyPatternLength);

            RuleFor(x => x.Jira!.ExtractFrom)
                .Must(list => list.Count <= BrownfieldJobLimits.MaxExtractFromItems)
                .WithMessage($"extractFrom may contain at most {BrownfieldJobLimits.MaxExtractFromItems} values")
                .Must(list => list.All(BrownfieldJobLimits.ExtractFromSources.Contains))
                .WithMessage("extractFrom values must be commit_message and/or branch_name");
        });

        RuleFor(x => x.Knowledge)
            .NotNull()
            .WithMessage("knowledge is required");

        When(x => x.Knowledge is not null, () =>
        {
            RuleFor(x => x.Knowledge!.GranularityPrompt)
                .NotEmpty()
                .Must(g => BrownfieldJobLimits.GranularityPrompts.Contains(g))
                .WithMessage("granularityPrompt must be a supported tokenize_* value");

            RuleFor(x => x.Knowledge!.AdvisorPrompt)
                .MaximumLength(BrownfieldJobLimits.MaxAdvisorPromptLength)
                .When(x => !string.IsNullOrEmpty(x.Knowledge!.AdvisorPrompt));

            RuleFor(x => x.Knowledge!.IncludeConfluencePageIds)
                .Must(list => list is null || list.Count <= BrownfieldJobLimits.MaxConfluencePageIds)
                .WithMessage($"includeConfluencePageIds may contain at most {BrownfieldJobLimits.MaxConfluencePageIds} ids")
                .Must(list => list is null || list.All(id => id.Length <= BrownfieldJobLimits.MaxConfluencePageIdLength))
                .WithMessage($"each Confluence page id must be at most {BrownfieldJobLimits.MaxConfluencePageIdLength} characters");

            RuleFor(x => x.Knowledge!.ExcludePathPatterns)
                .Must(list => list.Count <= BrownfieldJobLimits.MaxExcludePatterns)
                .WithMessage($"excludePathPatterns may contain at most {BrownfieldJobLimits.MaxExcludePatterns} entries")
                .Must(list => list.All(p => p.Length <= BrownfieldJobLimits.MaxExcludePatternLength))
                .WithMessage($"each excludePathPattern must be at most {BrownfieldJobLimits.MaxExcludePatternLength} characters");

            RuleFor(x => x.Knowledge!.MaxShardTokens)
                .InclusiveBetween(BrownfieldJobLimits.MinMaxShardTokens, BrownfieldJobLimits.MaxMaxShardTokens);
        });

        When(x => x.Validation is not null, () =>
        {
            RuleFor(x => x.Validation!.DevilsAdvocateQuestionCount)
                .InclusiveBetween(
                    BrownfieldJobLimits.MinDevilsAdvocateQuestionCount,
                    BrownfieldJobLimits.MaxDevilsAdvocateQuestionCount);

            RuleFor(x => x.Validation!.MinAnswerScore)
                .InclusiveBetween(BrownfieldJobLimits.MinAnswerScore, BrownfieldJobLimits.MaxAnswerScore);

            RuleFor(x => x.Validation!.MaxRoundsPerCommit)
                .InclusiveBetween(BrownfieldJobLimits.MinMaxRoundsPerCommit, BrownfieldJobLimits.MaxMaxRoundsPerCommit);
        });

        When(x => x.Delivery is not null, () =>
        {
            RuleFor(x => x.Delivery!.PrTitle)
                .MaximumLength(BrownfieldJobLimits.MaxPrTitleLength)
                .When(x => !string.IsNullOrEmpty(x.Delivery!.PrTitle));

            RuleFor(x => x.Delivery!.PrBranch)
                .MaximumLength(BrownfieldJobLimits.MaxPrBranchLength)
                .When(x => !string.IsNullOrEmpty(x.Delivery!.PrBranch));
        });

        When(x => x.Agents?.Overrides is not null, () =>
        {
            RuleFor(x => x.Agents!.Overrides!)
                .Must(o => o.Count <= BrownfieldJobLimits.MaxAgentOverrides)
                .WithMessage($"agents.overrides may contain at most {BrownfieldJobLimits.MaxAgentOverrides} entries");

            RuleForEach(x => x.Agents!.Overrides!.Values)
                .ChildRules(overrideRules =>
                {
                    overrideRules.RuleFor(o => o.Model)
                        .MaximumLength(BrownfieldJobLimits.MaxAgentModelLength)
                        .When(o => !string.IsNullOrEmpty(o.Model));
                });
        });
    }
}
