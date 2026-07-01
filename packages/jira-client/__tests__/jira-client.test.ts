import { describe, it, expect, vi } from "vitest";
import { JiraClient, JiraIssueNotFoundError, adfToText } from "../src/index.js";

describe("adfToText", () => {
  it("converts a simple ADF document to plain text", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Hello world." }] },
        {
          type: "bulletList",
          content: [
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "First" }] }] },
          ],
        },
      ],
    };

    const text = adfToText(doc);
    expect(text).toContain("Hello world.");
    expect(text).toContain("- First");
  });

  it("returns empty string for null/undefined input", () => {
    expect(adfToText(null)).toBe("");
    expect(adfToText(undefined)).toBe("");
  });
});

describe("JiraClient", () => {
  it("fetches and maps an issue", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        key: "PROJ-1",
        fields: {
          summary: "Add login flow",
          description: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Body" }] }] },
          issuetype: { name: "Story" },
          status: { name: "Done" },
          priority: { name: "High" },
          labels: ["auth"],
          assignee: { displayName: "Alice" },
          reporter: { displayName: "Bob" },
          created: "2026-01-01T00:00:00.000Z",
          updated: "2026-01-02T00:00:00.000Z",
        },
      }),
    });

    const client = new JiraClient({
      baseUrl: "https://example.atlassian.net",
      authHeader: "Bearer test-token",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const issue = await client.getIssue("PROJ-1");

    expect(issue.key).toBe("PROJ-1");
    expect(issue.summary).toBe("Add login flow");
    expect(issue.descriptionText).toContain("Body");
    expect(issue.issueType).toBe("Story");
    expect(issue.assignee).toBe("Alice");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/rest/api/3/issue/PROJ-1"),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer test-token" }) }),
    );
  });

  it("throws JiraIssueNotFoundError on 404", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      headers: new Headers(),
      json: async () => ({}),
    });

    const client = new JiraClient({
      baseUrl: "https://example.atlassian.net",
      authHeader: "Bearer test-token",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await expect(client.getIssue("MISSING-1")).rejects.toBeInstanceOf(JiraIssueNotFoundError);
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
        json: async () => ({
          key: "PROJ-2",
          fields: { summary: "Retry works", issuetype: {}, status: {}, labels: [] },
        }),
      });

    const client = new JiraClient({
      baseUrl: "https://example.atlassian.net",
      authHeader: "Bearer test-token",
      fetchImpl: fetchMock as unknown as typeof fetch,
      maxRetries: 2,
    });

    const issue = await client.getIssue("PROJ-2");
    expect(issue.summary).toBe("Retry works");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
