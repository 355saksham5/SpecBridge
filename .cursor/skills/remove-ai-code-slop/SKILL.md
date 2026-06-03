---
name: remove-ai-code-slop
description: >-
  Identifies and removes AI-generated slop in Angular/TypeScript and C#/.NET
  (verbose comments, placeholder names, redundant code, empty blocks) and
  enforces project style. Use when cleaning up code, refactoring, or fixing style.
---

# Remove AI-Generated Code Slop

When cleaning code in this **Angular + ASP.NET Core** repo, apply this checklist and fix any matches. Prefer **Prettier** / **ESLint** for TypeScript and **`dotnet format`** / **StyleCop.Analyzers** for C# when the project configures them.

## Slop Patterns to Remove

### Naming
- **Placeholder names**: `temp`, `data`, `data2`, `result`, `resultFinal`, `foo`, `bar`, `baz`, `testVar`, `test123` → Replace with descriptive names.
- **Generic handlers**: `HandleIt`, `DoStuff`, `ProcessData` → Split or rename to reflect actual behavior.

### Comments
- **Remove**: Obvious comments that restate the code (`// Increment counter` above `counter++`).
- **Remove**: Entire blocks of commented-out code.
- **Resolve or remove**: `TODO`, `FIXME`, `HACK`, `XXX` — either implement or delete.
- **Trim**: Inflated XML doc comments (`///`) with buzzwords; keep only useful documentation.

### Dead Code
- Unused `using` directives and imports.
- Unreachable code after early returns or `throw`.
- Redundant null checks that add no value (e.g. null-check before `?.` safe-navigation already handles it).
- Empty `catch` blocks with only a comment — handle, log, or rethrow.

### Redundancy
- Overly defensive checks (e.g., null checks before operations that already guard).
- Duplicated logic — extract to a single method or extension.
- Unnecessary intermediate variables used only once.
- Explicit `.ToList()` calls where `IEnumerable<T>` is sufficient and no second enumeration occurs.

### Style Consistency
- Match project conventions: naming (PascalCase methods/properties, camelCase locals), brace placement, spacing.
- One statement per line where readable.
- Remove trailing whitespace and fix inconsistent indentation.
- Align with `.editorconfig` rules; run `dotnet format` to verify.

## Workflow

1. **Scan** the target file(s) for the patterns above.
2. **Fix** each match: rename, delete, simplify, or extract.
3. **Verify** no behavior change; run tests if available.
4. **Format** per project style (e.g., `npx prettier --write` for TS; `dotnet format` for C#).

## Examples

**Before (slop, TypeScript):**
```typescript
// Get the user data
getData() {
  const x = this.http.get('/api/x'); // TODO
  return x;
}
```

**After (clean):**
```typescript
loadUserProfile(): Observable<UserProfile> {
  return this.http.get<UserProfile>('/api/me');
}
```

**Before (slop, C#):**
```csharp
try
{
    ParseConfig();
}
catch (Exception)
{
    // TODO: handle errors
}
```

**After (clean):**
```csharp
try
{
    ParseConfig();
}
catch (ConfigurationException ex)
{
    _logger.LogWarning(ex, "Config parse failed, using defaults");
}
```

## Anti-Patterns

- Do not add comments to explain what was removed.
- Do not over-simplify to the point of obscuring intent.
- Preserve meaningful error handling and edge-case logic.
