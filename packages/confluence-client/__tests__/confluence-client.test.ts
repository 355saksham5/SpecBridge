import { describe, it, expect, vi } from "vitest";
import { ConfluenceClient, ConfluencePageNotFoundError, buildConfluenceContext, confluenceStorageToMarkdown } from "../src/index.js";

describe("confluenceStorageToMarkdown", () => {
  it("converts Confluence storage-format XHTML to Markdown", () => {
    const html = "<h1>Title</h1><p>Hello <strong>world</strong>.</p><ul><li>First</li><li>Second</li></ul>";
    const markdown = confluenceStorageToMarkdown(html);
    expect(markdown).toContain("# Title");
    expect(markdown).toContain("**world**");
    expect(markdown).toContain("First");
  });

  it("returns empty string for empty input", () => {
    expect(confluenceStorageToMarkdown("")).toBe("");
    expect(confluenceStorageToMarkdown("   ")).toBe("");
  });
});

describe("ConfluenceClient", () => {
  it("fetches and converts a page", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        id: "12345",
        title: "Auth Design Notes",
        body: { storage: { value: "<p>Use OAuth2 with PKCE.</p>" } },
        _links: { webui: "/spaces/ENG/pages/12345", base: "https://example.atlassian.net/wiki" },
      }),
    });

    const client = new ConfluenceClient({
      baseUrl: "https://example.atlassian.net/wiki",
      authHeader: "Basic dGVzdA==",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const page = await client.getPage("12345");
    expect(page.title).toBe("Auth Design Notes");
    expect(page.markdown).toContain("OAuth2 with PKCE");
    expect(page.url).toBe("https://example.atlassian.net/wiki/spaces/ENG/pages/12345");
  });

  it("throws ConfluencePageNotFoundError on 404", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404, headers: new Headers(), json: async () => ({}) });
    const client = new ConfluenceClient({
      baseUrl: "https://example.atlassian.net/wiki",
      authHeader: "Basic dGVzdA==",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await expect(client.getPage("missing")).rejects.toBeInstanceOf(ConfluencePageNotFoundError);
  });

  it("retries on 429 and honors Retry-After", async () => {
    const headers = new Headers({ "Retry-After": "0" });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429, headers, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ id: "1", title: "Retried", body: { storage: { value: "<p>ok</p>" } }, _links: {} }),
      });

    const client = new ConfluenceClient({
      baseUrl: "https://example.atlassian.net/wiki",
      authHeader: "Basic dGVzdA==",
      fetchImpl: fetchMock as unknown as typeof fetch,
      maxRetries: 2,
    });

    const page = await client.getPage("1");
    expect(page.title).toBe("Retried");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("buildConfluenceContext", () => {
  it("concatenates pages found, tracks missing ids, and caps page count", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/content/1")) {
        return { ok: true, status: 200, headers: new Headers(), json: async () => ({ id: "1", title: "Page One", body: { storage: { value: "<p>Content one.</p>" } }, _links: {} }) };
      }
      if (url.includes("/content/2")) {
        return { ok: false, status: 404, headers: new Headers(), json: async () => ({}) };
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const client = new ConfluenceClient({
      baseUrl: "https://example.atlassian.net/wiki",
      authHeader: "Basic dGVzdA==",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const result = await buildConfluenceContext(client, ["1", "2"]);
    expect(result.markdown).toContain("Page One");
    expect(result.markdown).toContain("Content one.");
    expect(result.pages).toHaveLength(1);
    expect(result.missingPageIds).toEqual(["2"]);
  });

  it("returns empty markdown when no page ids given", async () => {
    const client = new ConfluenceClient({ baseUrl: "https://example.atlassian.net/wiki", authHeader: "Basic x" });
    const result = await buildConfluenceContext(client, []);
    expect(result.markdown).toBe("");
    expect(result.pages).toEqual([]);
  });
});
