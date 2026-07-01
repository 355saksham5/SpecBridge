import { describe, it, expect } from "vitest";
import { computeOverlap, extractPredictedPaths } from "../src/index.js";

describe("computeOverlap", () => {
  it("returns full overlap when predicted equals actual", () => {
    const metrics = computeOverlap(["src/a.ts", "src/b.ts"], ["src/a.ts", "src/b.ts"]);
    expect(metrics.overlapPercent).toBe(1);
    expect(metrics.missedPaths).toEqual([]);
    expect(metrics.hallucinatedPaths).toEqual([]);
  });

  it("computes Jaccard overlap for partial match", () => {
    const metrics = computeOverlap(["src/a.ts", "src/x.ts"], ["src/a.ts", "src/b.ts"]);
    // intersection = {a.ts} = 1, union = {a.ts, x.ts, b.ts} = 3
    expect(metrics.overlapPercent).toBeCloseTo(1 / 3, 3);
    expect(metrics.missedPaths).toEqual(["src/b.ts"]);
    expect(metrics.hallucinatedPaths).toEqual(["src/x.ts"]);
  });

  it("treats no prediction against a real diff as zero overlap", () => {
    const metrics = computeOverlap([], ["src/a.ts"]);
    expect(metrics.overlapPercent).toBe(0);
    expect(metrics.missedPaths).toEqual(["src/a.ts"]);
    expect(metrics.hallucinatedPaths).toEqual([]);
  });

  it("treats two empty sets as perfect (vacuous) overlap", () => {
    const metrics = computeOverlap([], []);
    expect(metrics.overlapPercent).toBe(1);
  });

  it("normalizes backslashes and leading ./ before comparing", () => {
    const metrics = computeOverlap(["./src\\a.ts"], ["src/a.ts"]);
    expect(metrics.overlapPercent).toBe(1);
  });
});

describe("extractPredictedPaths", () => {
  it("extracts backtick-quoted paths", () => {
    const text = "We touched `apps/api/Program.cs` and added a new endpoint.";
    expect(extractPredictedPaths(text)).toEqual(["apps/api/Program.cs"]);
  });

  it("extracts bare slash+extension tokens", () => {
    const text = "Changes land in apps/api/Program.cs and packages/foo/src/index.ts.";
    expect(extractPredictedPaths(text)).toEqual(["apps/api/Program.cs", "packages/foo/src/index.ts"]);
  });

  it("resolves a bare filename to a known full path via suffix match", () => {
    const text = "The fix lives in `Program.cs`.";
    const known = ["apps/api/Program.cs", "apps/api/Startup.cs"];
    expect(extractPredictedPaths(text, known)).toEqual(["apps/api/Program.cs"]);
  });

  it("returns an empty array when no paths are mentioned", () => {
    expect(extractPredictedPaths("This is prose with no file references at all.")).toEqual([]);
  });
});
