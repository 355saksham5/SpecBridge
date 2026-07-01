export type StackProfile = {
  detectedAt: string;
  repoPath: string;
  headSha?: string;
  languages: LanguageStat[];
  frameworks: string[];
  packageManagers: string[];
  buildTools: string[];
  entrypoints: string[];
  testFrameworks: string[];
  ciSystems: string[];
  containerized: boolean;
  monorepo: boolean;
  primaryLanguage: string | null;
  /** True when file walk hit maxFiles before completing the repo scan. */
  scanTruncated?: boolean;
  filesScanned?: number;
};

export type LanguageStat = {
  language: string;
  fileCount: number;
  extensions: string[];
};

export type DetectStackOptions = {
  excludePathPatterns?: string[];
  headSha?: string;
  maxFiles?: number;
  /** When true, apply MONOREPO_MODULE_EXCLUDES in addition to defaults. */
  monorepoExcludes?: boolean;
};

export type GranularityPrompt =
  | "tokenize_function"
  | "tokenize_class"
  | "tokenize_namespace"
  | "tokenize_features"
  | "tokenize_top_level_rules"
  | "tokenize_file";
