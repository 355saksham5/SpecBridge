export type { StackProfile, LanguageStat, DetectStackOptions, GranularityPrompt } from "./types.js";
export {
  detectStack,
  writeStackProfile,
  matchesExcludePattern,
  DEFAULT_EXCLUDES,
  EXTENSION_MAP,
  MARKER_FILES,
} from "./detect.js";
