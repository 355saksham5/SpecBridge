import { describe, it, expect } from "vitest";
import { HandoffValidator } from "../src/handoff-validator.js";

describe("HandoffValidator", () => {
  const validator = new HandoffValidator();

  it("validates calibration-report schema", () => {
    const result = validator.validate("calibration-report", {
      commitSha: "abc1234",
      overlapPercent: 0.72,
      missedPaths: ["src/missed.ts"],
      hallucinatedPaths: [],
    });
    expect(result.valid).toBe(true);
  });

  it("rejects invalid questions payload", () => {
    const result = validator.validate("questions", { commitSha: "abc", questions: [] });
    expect(result.valid).toBe(false);
  });
});
