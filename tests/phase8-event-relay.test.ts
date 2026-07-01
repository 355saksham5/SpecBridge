import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { resolveEventRelayOptions } from "../apps/knowledge-worker/src/event-relay.js";

describe("event-relay", () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
    delete process.env.SPECBRIDGE_API_BASE_URL;
    delete process.env.SPECBRIDGE_EVENTS_API_KEY;
  });

  afterEach(() => {
    process.env = env;
  });

  it("returns null when API base URL or events key is missing", () => {
    expect(resolveEventRelayOptions("job-1")).toBeNull();

    process.env.SPECBRIDGE_API_BASE_URL = "http://localhost:5000";
    expect(resolveEventRelayOptions("job-1")).toBeNull();

    process.env.SPECBRIDGE_EVENTS_API_KEY = "secret";
    expect(resolveEventRelayOptions("job-1")).toEqual({
      apiBaseUrl: "http://localhost:5000",
      eventsApiKey: "secret",
      jobId: "job-1",
    });
  });
});
