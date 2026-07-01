import type { JiraClientOptions, JiraIssue } from "./types.js";
import { adfToText } from "./adf.js";

export class JiraIssueNotFoundError extends Error {
  constructor(public readonly key: string, public readonly status: number) {
    super(`Jira issue not found or inaccessible: ${key} (HTTP ${status})`);
    this.name = "JiraIssueNotFoundError";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class JiraClient {
  private readonly baseUrl: string;
  private readonly authHeader: string;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: JiraClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.authHeader = options.authHeader;
    this.maxRetries = options.maxRetries ?? 3;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  /** Fetches a single issue by key (e.g. `ITDIGIT-1234`) via Jira Cloud REST v3. */
  async getIssue(key: string): Promise<JiraIssue> {
    const url = `${this.baseUrl}/rest/api/3/issue/${encodeURIComponent(key)}?fields=summary,description,issuetype,status,priority,labels,assignee,reporter,created,updated`;

    const response = await this.requestWithRetry(url);

    if (response.status === 404) {
      throw new JiraIssueNotFoundError(key, 404);
    }
    if (!response.ok) {
      throw new JiraIssueNotFoundError(key, response.status);
    }

    const body = (await response.json()) as {
      key: string;
      fields: {
        summary?: string;
        description?: unknown;
        issuetype?: { name?: string };
        status?: { name?: string };
        priority?: { name?: string } | null;
        labels?: string[];
        assignee?: { displayName?: string } | null;
        reporter?: { displayName?: string } | null;
        created?: string;
        updated?: string;
      };
    };

    return {
      key: body.key,
      summary: body.fields.summary ?? "",
      descriptionText: adfToText(body.fields.description),
      issueType: body.fields.issuetype?.name ?? "Unknown",
      status: body.fields.status?.name ?? "Unknown",
      priority: body.fields.priority?.name ?? null,
      labels: body.fields.labels ?? [],
      assignee: body.fields.assignee?.displayName ?? null,
      reporter: body.fields.reporter?.displayName ?? null,
      created: body.fields.created ?? "",
      updated: body.fields.updated ?? "",
    };
  }

  /** Fetches multiple issues, tolerating individual not-found keys. */
  async getIssues(keys: string[]): Promise<Map<string, JiraIssue | null>> {
    const results = new Map<string, JiraIssue | null>();
    for (const key of keys) {
      try {
        results.set(key, await this.getIssue(key));
      } catch (err) {
        if (err instanceof JiraIssueNotFoundError) {
          results.set(key, null);
        } else {
          throw err;
        }
      }
    }
    return results;
  }

  private async requestWithRetry(url: string): Promise<Response> {
    let attempt = 0;
    let lastResponse: Response | undefined;

    while (attempt <= this.maxRetries) {
      const response = await this.fetchImpl(url, {
        headers: {
          Authorization: this.authHeader,
          Accept: "application/json",
        },
      });

      if (response.status !== 429 && response.status < 500) return response;

      lastResponse = response;
      const retryAfterHeader = response.headers.get("Retry-After");
      const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : 500 * 2 ** attempt;
      attempt++;
      if (attempt > this.maxRetries) break;
      await sleep(Math.min(retryAfterMs, 10_000));
    }

    return lastResponse!;
  }
}
