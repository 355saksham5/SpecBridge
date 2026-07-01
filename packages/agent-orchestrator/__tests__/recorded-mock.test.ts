import { describe, it, expect } from "vitest";
import { lookupRecordedResponse, listRecordedFixtures } from "../src/recorded-mock.js";

describe("recorded-mock", () => {
  it("returns role-specific fixtures", () => {
    const fixtures = listRecordedFixtures();
    expect(fixtures.length).toBeGreaterThanOrEqual(6);
    expect(lookupRecordedResponse("knowledge-architect", "Bootstrap SpecBridge knowledge at HEAD.").taskKey).toBe("bootstrap");
  });

  it("falls back to role default when task key unknown", () => {
    const resp = lookupRecordedResponse("feature-historian", "something unrelated");
    expect(resp.role).toBe("feature-historian");
    expect(resp.result).toContain("recorded");
  });
});
