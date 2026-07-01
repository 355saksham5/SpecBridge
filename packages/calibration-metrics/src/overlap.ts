import type { CalibrationMetrics } from "./types.js";

export function normalizePath(path: string): string {
  return path.trim().replace(/\\/g, "/").replace(/^\.\//, "");
}

/**
 * Deterministic Jaccard-style overlap between a predicted change set (derived
 * from the Feature Historian's retro spec) and the actual `git diff
 * parent..C_i` paths. Symmetric: penalizes both missed and hallucinated
 * paths, unlike a recall-only score that would ignore hallucinations.
 */
export function computeOverlap(predictedPathsInput: string[], actualPathsInput: string[]): CalibrationMetrics {
  const predictedPaths = [...new Set(predictedPathsInput.map(normalizePath))].sort();
  const actualPaths = [...new Set(actualPathsInput.map(normalizePath))].sort();

  const predictedSet = new Set(predictedPaths);
  const actualSet = new Set(actualPaths);

  const missedPaths = actualPaths.filter((p) => !predictedSet.has(p));
  const hallucinatedPaths = predictedPaths.filter((p) => !actualSet.has(p));
  const intersectionSize = actualPaths.length - missedPaths.length;
  const unionSize = predictedSet.size + actualSet.size - intersectionSize;

  const overlapPercent = unionSize === 0 ? 1 : intersectionSize / unionSize;

  return {
    overlapPercent: Math.round(overlapPercent * 1000) / 1000,
    predictedPaths,
    actualPaths,
    missedPaths,
    hallucinatedPaths,
  };
}
