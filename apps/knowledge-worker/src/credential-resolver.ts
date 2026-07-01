import type { JiraEnrichmentOptions } from "./commit-walk-pipeline.js";
import type { GitHubDeliveryOptions } from "./pr-delivery.js";

export type WorkerJobCredentials = {
  cursorCredentialId: string;
  githubConnectionId: string;
  jiraConnectionId?: string;
};

export type ResolvedWorkerCredentials = {
  cursorApiKey?: string;
  github?: { authHeader: string; apiBaseUrl: string };
  jira?: { baseUrl: string; authHeader: string };
};

export type CredentialResolverOptions = {
  apiBaseUrl: string;
  eventsApiKey: string;
  organizationId: string;
  credentials: WorkerJobCredentials;
};

/**
 * Fetches short-lived credentials from the API internal endpoint (Key Vault backed).
 * Returns null when API env vars are unset — caller falls back to process.env.CURSOR_API_KEY.
 */
export async function resolveWorkerCredentials(
  options: CredentialResolverOptions,
): Promise<ResolvedWorkerCredentials | null> {
  const url = `${options.apiBaseUrl.replace(/\/$/, "")}/v1/internal/worker/resolve-credentials`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-SpecBridge-Events-Key": options.eventsApiKey,
    },
    body: JSON.stringify({
      organizationId: options.organizationId,
      cursorCredentialId: options.credentials.cursorCredentialId,
      githubConnectionId: options.credentials.githubConnectionId,
      jiraConnectionId: options.credentials.jiraConnectionId ?? null,
    }),
  });

  if (!response.ok) {
    throw new Error(`Credential resolve failed (${response.status})`);
  }

  return (await response.json()) as ResolvedWorkerCredentials;
}

export function applyResolvedCredentials(
  resolved: ResolvedWorkerCredentials | null,
): {
  cursorApiKey?: string;
  jira?: JiraEnrichmentOptions;
  github?: GitHubDeliveryOptions;
} {
  if (!resolved) {
    return { cursorApiKey: process.env.CURSOR_API_KEY };
  }

  return {
    cursorApiKey: resolved.cursorApiKey ?? process.env.CURSOR_API_KEY,
    jira: resolved.jira
      ? { baseUrl: resolved.jira.baseUrl, authHeader: resolved.jira.authHeader }
      : undefined,
    github: resolved.github
      ? { authHeader: resolved.github.authHeader, baseUrl: resolved.github.apiBaseUrl }
      : undefined,
  };
}

export function resolveCredentialResolverOptions(
  organizationId: string | undefined,
  credentials: WorkerJobCredentials | undefined,
): CredentialResolverOptions | null {
  const apiBaseUrl = process.env.SPECBRIDGE_API_BASE_URL;
  const eventsApiKey = process.env.SPECBRIDGE_EVENTS_API_KEY;
  if (!apiBaseUrl || !eventsApiKey || !organizationId || !credentials) {
    return null;
  }

  return { apiBaseUrl, eventsApiKey, organizationId, credentials };
}
