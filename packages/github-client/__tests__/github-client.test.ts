import { describe, it, expect, vi } from "vitest";
import { GitHubClient, GitHubApiError } from "../src/index.js";

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(headers),
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

describe("GitHubClient.openPullRequestWithFiles", () => {
  it("walks the git data API to open a PR without touching unlisted files", async () => {
    const calls: Array<{ url: string; method: string; body?: unknown }> = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(init.body as string) : undefined });

      if (url.endsWith("/git/ref/heads/main")) return jsonResponse(200, { object: { sha: "base-sha" } });
      if (url.endsWith("/git/commits/base-sha")) return jsonResponse(200, { tree: { sha: "base-tree-sha" } });
      if (url.endsWith("/git/blobs")) return jsonResponse(201, { sha: "blob-sha-1" });
      if (url.endsWith("/git/trees")) return jsonResponse(201, { sha: "new-tree-sha" });
      if (url.endsWith("/git/commits")) return jsonResponse(201, { sha: "new-commit-sha" });
      if (url.endsWith("/git/refs")) return jsonResponse(201, { ref: "refs/heads/sdd/onboarding/job-1" });
      if (url.endsWith("/pulls")) return jsonResponse(201, { html_url: "https://github.com/acme/widgets/pull/42", number: 42 });

      throw new Error(`Unexpected URL: ${url}`);
    });

    const client = new GitHubClient({ authHeader: "Bearer installation-token", fetchImpl: fetchMock as unknown as typeof fetch });

    const result = await client.openPullRequestWithFiles({
      owner: "acme",
      repo: "widgets",
      baseBranch: "main",
      newBranch: "sdd/onboarding/job-1",
      files: [
        { path: "AGENTS.md", content: "# handbook" },
        { path: ".sdd/docs/project_knowledge.md", content: Buffer.from("# knowledge") },
      ],
      commitMessage: "chore: onboard SDD kit",
      prTitle: "SpecBridge: onboard SDD kit",
      prBody: "Automated onboarding PR",
    });

    expect(result).toEqual({ url: "https://github.com/acme/widgets/pull/42", number: 42, branch: "sdd/onboarding/job-1" });

    const treeCall = calls.find((c) => c.url.endsWith("/git/trees"));
    expect((treeCall!.body as { base_tree: string }).base_tree).toBe("base-tree-sha");
    expect((treeCall!.body as { tree: unknown[] }).tree).toHaveLength(2);

    const blobCalls = calls.filter((c) => c.url.endsWith("/git/blobs"));
    expect(blobCalls).toHaveLength(2);
    expect((blobCalls[0].body as { encoding: string }).encoding).toBe("base64");
  });

  it("fast-forwards an existing branch and reuses an existing open PR on retry", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (url.endsWith("/git/ref/heads/main")) return jsonResponse(200, { object: { sha: "base-sha" } });
      if (url.endsWith("/git/commits/base-sha")) return jsonResponse(200, { tree: { sha: "base-tree-sha" } });
      if (url.endsWith("/git/blobs")) return jsonResponse(201, { sha: "blob-sha" });
      if (url.endsWith("/git/trees")) return jsonResponse(201, { sha: "tree-sha" });
      if (url.endsWith("/git/commits")) return jsonResponse(201, { sha: "commit-sha" });
      if (url.endsWith("/git/refs") && method === "POST") return jsonResponse(422, { message: "Reference already exists" });
      if (url.includes("/git/refs/heads/") && method === "PATCH") return jsonResponse(200, { ref: "refs/heads/sdd/onboarding/job-1" });
      if (url.endsWith("/pulls") && method === "POST") return jsonResponse(422, { message: "A pull request already exists" });
      if (url.includes("/pulls?head=")) return jsonResponse(200, [{ html_url: "https://github.com/acme/widgets/pull/7", number: 7 }]);

      throw new Error(`Unexpected URL: ${url} (${method})`);
    });

    const client = new GitHubClient({ authHeader: "Bearer token", fetchImpl: fetchMock as unknown as typeof fetch });

    const result = await client.openPullRequestWithFiles({
      owner: "acme",
      repo: "widgets",
      baseBranch: "main",
      newBranch: "sdd/onboarding/job-1",
      files: [{ path: "AGENTS.md", content: "# handbook" }],
      commitMessage: "chore: onboard SDD kit",
      prTitle: "SpecBridge: onboard SDD kit",
    });

    expect(result).toEqual({ url: "https://github.com/acme/widgets/pull/7", number: 7, branch: "sdd/onboarding/job-1" });
  });

  it("retries on secondary rate limit (403 with x-ratelimit-remaining: 0)", async () => {
    let refAttempts = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/git/ref/heads/main")) {
        refAttempts++;
        if (refAttempts === 1) {
          return jsonResponse(403, { message: "rate limited" }, { "x-ratelimit-remaining": "0", "Retry-After": "0" });
        }
        return jsonResponse(200, { object: { sha: "base-sha" } });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const client = new GitHubClient({ authHeader: "Bearer token", fetchImpl: fetchMock as unknown as typeof fetch, maxRetries: 2 });
    const sha = await client.getRefSha("acme", "widgets", "main");

    expect(sha).toBe("base-sha");
    expect(refAttempts).toBe(2);
  });

  it("throws GitHubApiError for unexpected non-2xx responses", async () => {
    const fetchMock = vi.fn(async () => jsonResponse(404, { message: "Not Found" }));
    const client = new GitHubClient({ authHeader: "Bearer token", fetchImpl: fetchMock as unknown as typeof fetch });

    await expect(client.getRefSha("acme", "missing-repo", "main")).rejects.toBeInstanceOf(GitHubApiError);
  });
});
