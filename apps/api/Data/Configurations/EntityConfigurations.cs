using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using SpecBridge.Api.Data.Entities;

namespace SpecBridge.Api.Data.Configurations;

public sealed class BrownfieldJobConfiguration : IEntityTypeConfiguration<BrownfieldJob>
{
    public void Configure(EntityTypeBuilder<BrownfieldJob> builder)
    {
        builder.ToTable("brownfield_jobs");
        builder.HasKey(j => j.Id);
        builder.Property(j => j.RepoUrl).HasMaxLength(2048).IsRequired();
        builder.Property(j => j.Status).HasMaxLength(64).IsRequired();
        builder.Property(j => j.HeadSha).HasMaxLength(64);
        builder.Property(j => j.CurrentPhase).HasMaxLength(64);
        builder.Property(j => j.CurrentAgentRole).HasMaxLength(64);
        builder.Property(j => j.CurrentCommitSha).HasMaxLength(64);
        builder.Property(j => j.PrUrl).HasMaxLength(2048);
        builder.Property(j => j.BundleBlobName).HasMaxLength(512);
        builder.HasIndex(j => new { j.OrganizationId, j.CreatedAt });
    }
}

public sealed class CursorCredentialConfiguration : IEntityTypeConfiguration<CursorCredential>
{
    public void Configure(EntityTypeBuilder<CursorCredential> builder)
    {
        builder.ToTable("cursor_credentials");
        builder.HasKey(c => c.Id);
        builder.Property(c => c.KeyVaultSecretName).HasMaxLength(256).IsRequired();
        builder.Property(c => c.Name).HasMaxLength(128);
        builder.Property(c => c.Last4).HasMaxLength(4);
    }
}

public sealed class GitHubConnectionConfiguration : IEntityTypeConfiguration<GitHubConnection>
{
    public void Configure(EntityTypeBuilder<GitHubConnection> builder)
    {
        builder.ToTable("github_connections");
        builder.HasKey(g => g.Id);
        builder.Property(g => g.HostType).HasMaxLength(32).IsRequired();
        builder.Property(g => g.WebUrl).HasMaxLength(2048).IsRequired();
        builder.Property(g => g.ApiBaseUrl).HasMaxLength(2048).IsRequired();
        builder.Property(g => g.KeyVaultSecretName).HasMaxLength(256);
    }
}

public sealed class JobEventRecordConfiguration : IEntityTypeConfiguration<JobEventRecord>
{
    public void Configure(EntityTypeBuilder<JobEventRecord> builder)
    {
        builder.ToTable("job_events");
        builder.HasKey(e => e.Id);
        builder.Property(e => e.EventType).HasMaxLength(64).IsRequired();
        builder.Property(e => e.DataJson).HasMaxLength(32768).IsRequired();
        builder.HasIndex(e => new { e.BrownfieldJobId, e.CreatedAt });
    }
}

public sealed class JiraConnectionConfiguration : IEntityTypeConfiguration<JiraConnection>
{
    public void Configure(EntityTypeBuilder<JiraConnection> builder)
    {
        builder.ToTable("jira_connections");
        builder.HasKey(j => j.Id);
        builder.Property(j => j.BaseUrl).HasMaxLength(2048).IsRequired();
        builder.Property(j => j.KeyVaultSecretName).HasMaxLength(256).IsRequired();
    }
}

public sealed class ConfluenceConnectionConfiguration : IEntityTypeConfiguration<ConfluenceConnection>
{
    public void Configure(EntityTypeBuilder<ConfluenceConnection> builder)
    {
        builder.ToTable("confluence_connections");
        builder.HasKey(c => c.Id);
        builder.Property(c => c.BaseUrl).HasMaxLength(2048).IsRequired();
        builder.Property(c => c.KeyVaultSecretName).HasMaxLength(256).IsRequired();
    }
}

public sealed class OrganizationConfiguration : IEntityTypeConfiguration<Organization>
{
    public void Configure(EntityTypeBuilder<Organization> builder)
    {
        builder.ToTable("organizations");
        builder.HasKey(o => o.Id);
        builder.Property(o => o.Name).HasMaxLength(256).IsRequired();
    }
}

public sealed class JobCommitConfiguration : IEntityTypeConfiguration<JobCommit>
{
    public void Configure(EntityTypeBuilder<JobCommit> builder)
    {
        builder.ToTable("job_commits");
        builder.HasKey(c => c.Id);
        builder.Property(c => c.CommitSha).HasMaxLength(64).IsRequired();
        builder.Property(c => c.JiraIssueKey).HasMaxLength(64);
        builder.Property(c => c.SkipReason).HasMaxLength(512);
        builder.HasOne(c => c.Job).WithMany(j => j.Commits).HasForeignKey(c => c.BrownfieldJobId);
    }
}

public sealed class JobPhaseRunConfiguration : IEntityTypeConfiguration<JobPhaseRun>
{
    public void Configure(EntityTypeBuilder<JobPhaseRun> builder)
    {
        builder.ToTable("job_phase_runs");
        builder.HasKey(r => r.Id);
        builder.Property(r => r.AgentRole).HasMaxLength(64).IsRequired();
        builder.Property(r => r.CommitSha).HasMaxLength(64);
        builder.Property(r => r.CursorAgentId).HasMaxLength(128);
        builder.Property(r => r.CursorRunId).HasMaxLength(128);
        builder.HasOne(r => r.Job).WithMany(j => j.PhaseRuns).HasForeignKey(r => r.BrownfieldJobId);
    }
}
