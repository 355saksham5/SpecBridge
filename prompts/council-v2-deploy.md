# Council-v2 Deploy Doc — Knowledge Architect Phase

Generate `.sdd/docs/project_deployment_knowledge.md` with this shape:

```markdown
# Deployment Knowledge — {repo}
> Refreshed: {ISO} at SHA {sha}

## Environments and regions
## Pipeline shape
## Infra modules
## Runtime topology
## Secrets and config sources
## Deploy procedures
## Rollback procedures
## Monitoring & alerts
```

Never put secret values in the doc — reference paths/names only.

Mark unknown sections **TBD**.
