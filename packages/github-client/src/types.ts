export type GitHubClientOptions = {
  /** `https://api.github.com` for github.com, or `https://{ghes-host}/api/v3` for GHES. */
  baseUrl?: string;
  /**
   * Fully-formed `Authorization` header value (e.g. `Bearer <installation-token>`).
   * The caller (worker) resolves this from the GitHub App installation token flow —
   * this package never touches raw credentials or storage.
   */
  authHeader: string;
  /** Max retry attempts on 403 (secondary rate limit) / 429 / 5xx. Default: 3. */
  maxRetries?: number;
  fetchImpl?: typeof fetch;
};

export type GitHubFile = {
  /** Repo-relative path, forward-slash separated. */
  path: string;
  content: string | Buffer;
};

export type OpenPullRequestOptions = {
  owner: string;
  repo: string;
  baseBranch: string;
  /** Branch to create (or update, if it already exists) from an up-to-date base. */
  newBranch: string;
  /** Files to add/update. Existing files not in this list are left untouched (merge-safe). */
  files: GitHubFile[];
  commitMessage: string;
  prTitle: string;
  prBody?: string;
};

export type PullRequestResult = {
  url: string;
  number: number;
  branch: string;
};

export class GitHubApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly path: string,
    message: string,
  ) {
    super(`GitHub API error ${status} on ${path}: ${message}`);
    this.name = "GitHubApiError";
  }
}
