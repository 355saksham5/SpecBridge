import { describe, it, expect } from "vitest";
import { detectStack, matchesExcludePattern } from "../src/index.js";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

describe("stack-detect", () => {
  it("matches exclude glob patterns", () => {
    expect(matchesExcludePattern("node_modules/foo/bar.js", ["**/node_modules/**"])).toBe(true);
    expect(matchesExcludePattern("src/index.ts", ["**/node_modules/**"])).toBe(false);
  });

  it("detects dotnet and typescript in specbridge repo", async () => {
    const profile = await detectStack(REPO_ROOT, { maxFiles: 5000 });

    expect(profile.languages.length).toBeGreaterThan(0);
    expect(profile.frameworks).toContain("dotnet");
    expect(profile.primaryLanguage).toBeTruthy();
    expect(profile.detectedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
