import type { ConfluenceClientOptions, ConfluencePage } from "./types.js";
import { confluenceStorageToMarkdown } from "./html-to-markdown.js";

export class ConfluencePageNotFoundError extends Error {
  constructor(public readonly pageId: string, public readonly status: number) {
    super(`Confluence page not found or inaccessible: ${pageId} (HTTP ${status})`);
    this.name = "ConfluencePageNotFoundError";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const MAX_PAGE_BYTES = 2_000_000;

export class ConfluenceClient {
  private readonly baseUrl: string;
  private readonly authHeader: string;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ConfluenceClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.authHeader = options.authHeader;
    this.maxRetries = options.maxRetries ?? 3;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  /** Fetches a single page by numeric content id and converts its body to Markdown. */
  async getPage(pageId: string): Promise<ConfluencePage> {
    const url = `${this.baseUrl}/rest/api/content/${encodeURIComponent(pageId)}?expand=body.storage,_links`;
    const response = await this.requestWithRetry(url);

    if (response.status === 404) {
      throw new ConfluencePageNotFoundError(pageId, 404);
    }
    if (!response.ok) {
      throw new ConfluencePageNotFoundError(pageId, response.status);
    }

    const body = (await response.json()) as {
      id: string;
      title?: string;
      body?: { storage?: { value?: string } };
      _links?: { webui?: string; base?: string };
    };

    const storageHtml = (body.body?.storage?.value ?? "").slice(0, MAX_PAGE_BYTES);
    const webui = body._links?.webui ?? "";
    const linkBase = body._links?.base ?? this.baseUrl;

    return {
      id: body.id,
      title: body.title ?? `Confluence page ${pageId}`,
      markdown: confluenceStorageToMarkdown(storageHtml),
      url: webui ? `${linkBase}${webui}` : linkBase,
    };
  }

  /** Fetches multiple pages, tolerating individual not-found/inaccessible ids. */
  async getPages(pageIds: string[]): Promise<Map<string, ConfluencePage | null>> {
    const results = new Map<string, ConfluencePage | null>();
    for (const pageId of pageIds) {
      try {
        results.set(pageId, await this.getPage(pageId));
      } catch (err) {
        if (err instanceof ConfluencePageNotFoundError) {
          results.set(pageId, null);
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
