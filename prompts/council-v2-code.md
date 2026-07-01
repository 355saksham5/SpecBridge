# Council-v2 Code Doc — Knowledge Architect Phase

Generate `.sdd/docs/project_knowledge.md` with this shape:

```markdown
# Project Knowledge — {repo}
> Refreshed: {ISO} at SHA {sha}

## Architecture overview
## Module / package map
## Existing features
## Key contracts
## External integrations
## Common code patterns
## Cross-cutting concerns
## Testing
## Build & packaging
## Configuration
## Conventions in effect
## Glossary
```

**Coverage standard:** A reviewer must answer "what does this project DO?", "where does auth live?", "what external services?", "how are tests organised?" from the doc alone.

Mark unknown sections **TBD**. Use stack profile to adapt section depth (Angular vs .NET vs Python, etc.).
