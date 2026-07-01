import { describe, expect, it } from "vitest";
import { shouldCloneRemoteRepo } from "../apps/knowledge-worker/src/repo-clone.js";

describe("shouldCloneRemoteRepo", () => {
  it("clones when repoUrl is set and repoPath is omitted", () => {
    expect(
      shouldCloneRemoteRepo({
        repoUrl: "https://github.com/org/repo",
      }),
    ).toBe(true);
  });

  it("skips clone when repoPath is provided", () => {
    expect(
      shouldCloneRemoteRepo({
        repoUrl: "https://github.com/org/repo",
        repoPath: "/tmp/repo",
      }),
    ).toBe(false);
  });

  it("skips clone when SPECBRIDGE_SKIP_CLONE is true", () => {
    const previous = process.env.SPECBRIDGE_SKIP_CLONE;
    process.env.SPECBRIDGE_SKIP_CLONE = "true";
    try {
      expect(
        shouldCloneRemoteRepo({
          repoUrl: "https://github.com/org/repo",
        }),
      ).toBe(false);
    } finally {
      if (previous === undefined) {
        delete process.env.SPECBRIDGE_SKIP_CLONE;
      } else {
        process.env.SPECBRIDGE_SKIP_CLONE = previous;
      }
    }
  });
});

describe("cloneRepoShallow validation", () => {
  it("rejects non-https repo URLs", async () => {
    const { cloneRepoShallow } = await import("../apps/knowledge-worker/src/repo-clone.js");
    await expect(
      cloneRepoShallow("http://github.com/org/repo", "/tmp/out", "main"),
    ).rejects.toThrow("https");
  });
});
