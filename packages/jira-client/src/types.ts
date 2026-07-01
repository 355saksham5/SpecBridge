export type JiraClientOptions = {
  baseUrl: string;
  /**
   * Fully-formed `Authorization` header value (e.g. `Bearer <token>` for
   * OAuth or `Basic <base64>` for API-token auth). The caller resolves this
   * from Key Vault — this package never touches raw credentials or storage.
   */
  authHeader: string;
  /** Max retry attempts on 429/5xx. Default: 3. */
  maxRetries?: number;
  fetchImpl?: typeof fetch;
};

export type JiraIssue = {
  key: string;
  summary: string;
  descriptionText: string;
  issueType: string;
  status: string;
  priority: string | null;
  labels: string[];
  assignee: string | null;
  reporter: string | null;
  created: string;
  updated: string;
};

export type JiraIssueNotFoundError = {
  key: string;
  status: number;
};
