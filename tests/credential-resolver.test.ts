import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  applyResolvedCredentials,
  resolveCredentialResolverOptions,
  resolveWorkerCredentials,
} from "../apps/knowledge-worker/src/credential-resolver.js";

describe("credential-resolver", () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = env;
  });

  it("resolveCredentialResolverOptions requires API env and credentials", () => {
    expect(
      resolveCredentialResolverOptions("org-1", {
        cursorCredentialId: "c1",
        githubConnectionId: "g1",
      }),
    ).toBeNull();

    process.env.SPECBRIDGE_API_BASE_URL = "http://localhost:5000";
    process.env.SPECBRIDGE_EVENTS_API_KEY = "secret";

    expect(
      resolveCredentialResolverOptions("org-1", {
        cursorCredentialId: "c1",
        githubConnectionId: "g1",
      }),
    ).toEqual({
      apiBaseUrl: "http://localhost:5000",
      eventsApiKey: "secret",
      organizationId: "org-1",
      credentials: { cursorCredentialId: "c1", githubConnectionId: "g1" },
    });
  });

  it("resolveWorkerCredentials posts to internal API", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        cursorApiKey: "sk-test",
        jira: { baseUrl: "https://jira.example", authHeader: "Bearer tok" },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveWorkerCredentials({
      apiBaseUrl: "http://localhost:5000",
      eventsApiKey: "secret",
      organizationId: "11111111-1111-1111-1111-111111111111",
      credentials: {
        cursorCredentialId: "22222222-2222-2222-2222-222222222222",
        githubConnectionId: "33333333-3333-3333-3333-333333333333",
      },
    });

    expect(result?.cursorApiKey).toBe("sk-test");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0][0])).toContain("/v1/internal/worker/resolve-credentials");
  });

  it("applyResolvedCredentials maps github and jira options", () => {
    const applied = applyResolvedCredentials({
      cursorApiKey: "sk-test",
      github: { authHeader: "Bearer gh", apiBaseUrl: "https://api.github.com" },
      jira: { baseUrl: "https://jira.example", authHeader: "Bearer jira" },
    });

    expect(applied.cursorApiKey).toBe("sk-test");
    expect(applied.github?.authHeader).toBe("Bearer gh");
    expect(applied.jira?.baseUrl).toBe("https://jira.example");
  });
});
