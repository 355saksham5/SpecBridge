export type ConfluenceClientOptions = {
  /** e.g. `https://your-domain.atlassian.net/wiki` */
  baseUrl: string;
  /**
   * Fully-formed `Authorization` header value (e.g. `Basic <base64(email:api-token)>`).
   * The caller resolves this from Key Vault — this package never touches raw credentials.
   */
  authHeader: string;
  /** Max retry attempts on 429/5xx. Default: 3. */
  maxRetries?: number;
  fetchImpl?: typeof fetch;
};

export type ConfluencePage = {
  id: string;
  title: string;
  /** Storage-format body converted to Markdown. */
  markdown: string;
  url: string;
};
