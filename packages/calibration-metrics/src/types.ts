export type CalibrationMetrics = {
  overlapPercent: number;
  predictedPaths: string[];
  actualPaths: string[];
  /** Actual paths the prediction failed to mention. */
  missedPaths: string[];
  /** Predicted paths that were not actually changed. */
  hallucinatedPaths: string[];
};

export type CalibrationReport = CalibrationMetrics & {
  commitSha: string;
};
