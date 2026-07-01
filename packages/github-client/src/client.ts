import { GitHubApiError, type GitHubClientOptions, type GitHubFile, type OpenPullRequestOptions, type PullRequestResult } from "./types.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toBase64(content: string | Buffer): string {
  return Buffer.isBuffer(content) ? content.toString("base64") : Buffer.from(content, "utf-8").toString("base64");
}

export class GitHubClient {
  private readonly baseUrl: string;
  private readonly authHeader: string;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: GitHubClientOptions) {
    this.baseUrl = (options.baseUrl ?? "https://api.github.com").replace(/\/+$/, "");
    this.authHeader = options.authHeader;
    this.maxRetries = options.maxRetries ?? 3;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  /**
   * Additive PR flow: reads the base branch's tree, layers the given files on
   * top via a new tree (unlisted paths are left untouched — no deletions),
   * commits, creates/updates `newBranch`, and opens a PR. Idempotent: safe to
   * call again for a job retry — an existing branch is fast-forwarded rather
   * than erroring.
   */
  async openPullRequestWithFiles(options: OpenPullRequestOptions): Promise<PullRequestResult> {
    const { owner, repo, baseBranch, newBranch, files, commitMessage, prTitle, prBody } = options;

    const baseSha = await this.getRefSha(owner, repo, baseBranch);
    const baseTreeSha = await this.getCommitTreeSha(owner, repo, baseSha);
    const treeSha = await this.createTree(owner, repo, baseTreeSha, files);
    const commitSha = await this.createCommit(owner, repo, commitMessage, treeSha, [baseSha]);

    await this.upsertBranch(owner, repo, newBranch, commitSha);

    const pr = await this.createOrGetPullRequest(owner, repo, {
      title: prTitle,
      head: newBranch,
      base: baseBranch,
      body: prBody,
    });

    return { url: pr.html_url, number: pr.number, branch: newBranch };
  }

  async getRefSha(owner: string, repo: string, branch: string): Promise<string> {
    const res = await this.request("GET", `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
    const body = (await res.json()) as { object: { sha: string } };
    return body.object.sha;
  }

  private async getCommitTreeSha(owner: string, repo: string, commitSha: string): Promise<string> {
    const res = await this.request("GET", `/repos/${owner}/${repo}/git/commits/${commitSha}`);
    const body = (await res.json()) as { tree: { sha: string } };
    return body.tree.sha;
  }

  private async createTree(owner: string, repo: string, baseTreeSha: string, files: GitHubFile[]): Promise<string> {
    const blobs = await Promise.all(
      files.map(async (file) => ({
        path: file.path,
        mode: "100644" as const,
        type: "blob" as const,
        sha: await this.createBlob(owner, repo, file.content),
      })),
    );

    const res = await this.request("POST", `/repos/${owner}/${repo}/git/trees`, {
      base_tree: baseTreeSha,
      tree: blobs,
    });
    const body = (await res.json()) as { sha: string };
    return body.sha;
  }

  private async createBlob(owner: string, repo: string, content: string | Buffer): Promise<string> {
    const res = await this.request("POST", `/repos/${owner}/${repo}/git/blobs`, {
      content: toBase64(content),
      encoding: "base64",
    });
    const body = (await res.json()) as { sha: string };
    return body.sha;
  }

  private async createCommit(owner: string, repo: string, message: string, treeSha: string, parents: string[]): Promise<string> {
    const res = await this.request("POST", `/repos/${owner}/${repo}/git/commits`, {
      message,
      tree: treeSha,
      parents,
    });
    const body = (await res.json()) as { sha: string };
    return body.sha;
  }

  private async upsertBranch(owner: string, repo: string, branch: string, sha: string): Promise<void> {
    const createRes = await this.request(
      "POST",
      `/repos/${owner}/${repo}/git/refs`,
      { ref: `refs/heads/${branch}`, sha },
      /* allowedStatuses */ [201, 422],
    );

    if (createRes.status === 422) {
      // Branch already exists (e.g. job retry) — fast-forward it instead.
      await this.request("PATCH", `/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, {
        sha,
        force: false,
      });
    }
  }

  private async createOrGetPullRequest(
    owner: string,
    repo: string,
    input: { title: string; head: string; base: string; body?: string },
  ): Promise<{ html_url: string; number: number }> {
    const createRes = await this.request(
      "POST",
      `/repos/${owner}/${repo}/pulls`,
      { title: input.title, head: input.head, base: input.base, body: input.body ?? "" },
      [201, 422],
    );

    if (createRes.status === 201) {
      return (await createRes.json()) as { html_url: string; number: number };
    }

    // 422 means a PR for this head/base already exists — look it up instead.
    const listRes = await this.request(
      "GET",
      `/repos/${owner}/${repo}/pulls?head=${encodeURIComponent(`${owner}:${input.head}`)}&base=${encodeURIComponent(input.base)}&state=open`,
    );
    const existing = (await listRes.json()) as Array<{ html_url: string; number: number }>;
    if (existing.length === 0) {
      throw new GitHubApiError(422, `/repos/${owner}/${repo}/pulls`, "PR creation failed and no existing open PR found");
    }
    return existing[0];
  }

  private async request(
    method: string,
    path: string,
    body?: unknown,
    allowedStatuses?: number[],
  ): Promise<Response> {
    let attempt = 0;
    let lastResponse: Response | undefined;

    while (attempt <= this.maxRetries) {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: this.authHeader,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      const isRateLimited = response.status === 429 || (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0");
      if (!isRateLimited && response.status < 500) {
        const statusIsAcceptable = allowedStatuses ? allowedStatuses.includes(response.status) : response.ok;
        if (!statusIsAcceptable) {
          const errBody = await response.text().catch(() => "");
          throw new GitHubApiError(response.status, path, errBody);
        }
        return response;
      }

      lastResponse = response;
      const retryAfterHeader = response.headers.get("Retry-After");
      const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : 500 * 2 ** attempt;
      attempt++;
      if (attempt > this.maxRetries) break;
      await sleep(Math.min(retryAfterMs, 10_000));
    }

    if (lastResponse && !lastResponse.ok) {
      const errBody = await lastResponse.text().catch(() => "");
      throw new GitHubApiError(lastResponse.status, path, errBody);
    }
    return lastResponse!;
  }
}
