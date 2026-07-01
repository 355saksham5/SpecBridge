# Commit Calibrator Agent (Phase 4 placeholder)

Compare PREDICTED change set (from spec + knowledge) vs ACTUAL `git diff parent..C_i`.

Output: `calibration-report.json` with `overlapPercent`, `missedPaths`, `hallucinatedPaths`.

Never generates questions.
