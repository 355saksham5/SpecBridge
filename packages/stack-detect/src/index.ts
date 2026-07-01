export type { StackProfile, LanguageStat, DetectStackOptions, GranularityPrompt } from "./types.js";
export {
  detectStack,
  writeStackProfile,
  matchesExcludePattern,
  DEFAULT_EXCLUDES,
  MAX_REPO_FILES,
  MONOREPO_MODULE_EXCLUDES,
  EXTENSION_MAP,
  MARKER_FILES,
} from "./detect.js";
