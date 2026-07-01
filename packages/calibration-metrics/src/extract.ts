import { normalizePath } from "./overlap.js";

const BACKTICK_PATH = /`([\w./-]+\.[A-Za-z0-9]+)`/g;
const BARE_PATH = /\b([\w-]+(?:\/[\w.-]+)+\.[A-Za-z]{1,10})\b/g;

/**
 * Extracts file-path-like tokens mentioned in a retro feature spec's prose —
 * this is the "predicted change set (from spec + knowledge)" the Commit
 * Calibrator diffs against the actual commit. Heuristic, not exhaustive:
 * catches backtick-quoted paths and bare `dir/file.ext` tokens.
 *
 * When `knownPaths` (e.g. knowledge shard paths) is supplied, an extracted
 * token that exactly matches, or is a path suffix of, a known path is
 * normalized to that known path — reducing false negatives from partial
 * mentions like "Program.cs" when the manifest knows "apps/api/Program.cs".
 */
export function extractPredictedPaths(specText: string, knownPaths: string[] = []): string[] {
  const found = new Set<string>();

  for (const match of specText.matchAll(BACKTICK_PATH)) {
    found.add(normalizePath(match[1]));
  }
  for (const match of specText.matchAll(BARE_PATH)) {
    found.add(normalizePath(match[1]));
  }

  const normalizedKnown = knownPaths.map(normalizePath);

  const resolved = [...found].map((token) => {
    const exact = normalizedKnown.find((known) => known === token);
    if (exact) return exact;

    const suffixMatch = normalizedKnown.find((known) => known.endsWith(`/${token}`) || known === token);
    return suffixMatch ?? token;
  });

  return [...new Set(resolved)].sort();
}
