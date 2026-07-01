import { readdir } from "node:fs/promises";
import { join, relative, extname, basename } from "node:path";
import type { DetectStackOptions, LanguageStat, StackProfile } from "./types.js";

/** Default cap for repos with >50k indexable files — walk stops early with truncation flag. */
export const MAX_REPO_FILES = 50_000;

/** Extra excludes applied when monorepo markers are detected or for large repos. */
export const MONOREPO_MODULE_EXCLUDES = [
  "**/packages/*/node_modules/**",
  "**/apps/*/node_modules/**",
  "**/tools/*/node_modules/**",
  "**/.pnpm/**",
  "**/target/**",
  "**/.gradle/**",
  "**/.idea/**",
  "**/coverage/**",
  "**/__pycache__/**",
  "**/.venv/**",
  "**/venv/**",
];

export const DEFAULT_EXCLUDES = [
  "**/node_modules/**",
  "**/bin/**",
  "**/obj/**",
  "**/.git/**",
  "**/dist/**",
  "**/build/**",
  "**/vendor/**",
  "**/.sdd/**",
];

export const EXTENSION_MAP: Record<string, string> = {
  ".cs": "csharp",
  ".csproj": "csharp",
  ".fs": "fsharp",
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".py": "python",
  ".java": "java",
  ".go": "go",
  ".rs": "rust",
  ".rb": "ruby",
  ".php": "php",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".json": "json",
  ".md": "markdown",
  ".vue": "vue",
  ".tf": "terraform",
  ".bicep": "bicep",
};

export const MARKER_FILES: Record<
  string,
  {
    frameworks?: string[];
    buildTools?: string[];
    packageManagers?: string[];
    testFrameworks?: string[];
    ciSystems?: string[];
    containerized?: boolean;
    monorepo?: boolean;
  }
> = {
  "package.json": { packageManagers: ["npm"] },
  "pnpm-lock.yaml": { packageManagers: ["pnpm"] },
  "yarn.lock": { packageManagers: ["yarn"] },
  "angular.json": { frameworks: ["angular"], buildTools: ["ng"] },
  "next.config.ts": { frameworks: ["nextjs"] },
  "turbo.json": { buildTools: ["turbo"], monorepo: true },
  "nx.json": { buildTools: ["nx"], monorepo: true },
  "global.json": { frameworks: ["dotnet"] },
  "pyproject.toml": { frameworks: ["python"], packageManagers: ["pip"] },
  "go.mod": { frameworks: ["go"], packageManagers: ["go-modules"] },
  "Cargo.toml": { frameworks: ["rust"], packageManagers: ["cargo"] },
  "pom.xml": { frameworks: ["java", "maven"], buildTools: ["maven"] },
  "Dockerfile": { containerized: true },
  "docker-compose.yml": { containerized: true },
  "Jenkinsfile": { ciSystems: ["jenkins"] },
  "vitest.config.ts": { testFrameworks: ["vitest"] },
  "jest.config.ts": { testFrameworks: ["jest"] },
};

export function matchesExcludePattern(relativePath: string, patterns: string[]): boolean {
  const normalized = relativePath.replace(/\\/g, "/");
  for (const pattern of patterns) {
    if (globMatch(normalized, pattern)) return true;
  }
  return false;
}

function globMatch(path: string, pattern: string): boolean {
  const normalizedPattern = pattern.replace(/\\/g, "/");
  let regex = "^";
  for (let i = 0; i < normalizedPattern.length; i++) {
    const char = normalizedPattern[i];
    if (char === "*" && normalizedPattern[i + 1] === "*") {
      regex += ".*";
      i++;
      if (normalizedPattern[i + 1] === "/") i++;
    } else if (char === "*") {
      regex += "[^/]*";
    } else {
      regex += char.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`${regex}$`, "i").test(path);
}

async function walkFiles(
  dir: string,
  root: string,
  excludes: string[],
  maxFiles: number,
  acc: string[],
): Promise<void> {
  if (acc.length >= maxFiles) return;

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (acc.length >= maxFiles) break;
    const fullPath = join(dir, entry.name);
    const rel = relative(root, fullPath).replace(/\\/g, "/");

    if (matchesExcludePattern(rel, excludes)) continue;

    if (entry.isDirectory()) {
      await walkFiles(fullPath, root, excludes, maxFiles, acc);
    } else if (entry.isFile()) {
      acc.push(rel);
    }
  }
}

function countLanguages(files: string[]): LanguageStat[] {
  const counts = new Map<string, { count: number; extensions: Set<string> }>();

  for (const file of files) {
    const ext = extname(file).toLowerCase();
    const lang = EXTENSION_MAP[ext];
    if (!lang) continue;

    const existing = counts.get(lang) ?? { count: 0, extensions: new Set<string>() };
    existing.count += 1;
    existing.extensions.add(ext);
    counts.set(lang, existing);
  }

  return [...counts.entries()]
    .map(([language, { count, extensions }]) => ({
      language,
      fileCount: count,
      extensions: [...extensions].sort(),
    }))
    .sort((a, b) => b.fileCount - a.fileCount);
}

function detectFromMarkers(files: string[]): Pick<
  StackProfile,
  "frameworks" | "packageManagers" | "buildTools" | "entrypoints" | "testFrameworks" | "ciSystems" | "containerized" | "monorepo"
> {
  const frameworks = new Set<string>();
  const packageManagers = new Set<string>();
  const buildTools = new Set<string>();
  const entrypoints = new Set<string>();
  const testFrameworks = new Set<string>();
  const ciSystems = new Set<string>();
  let containerized = false;
  let monorepo = false;

  const fileSet = new Set(files.map((f) => f.replace(/\\/g, "/")));

  for (const [marker, hints] of Object.entries(MARKER_FILES)) {
    const found = [...fileSet].some(
      (f) => f === marker || f.endsWith(`/${marker}`) || basename(f) === marker,
    );
    if (!found) continue;

    hints.frameworks?.forEach((f) => frameworks.add(f));
    hints.packageManagers?.forEach((p) => packageManagers.add(p));
    hints.buildTools?.forEach((b) => buildTools.add(b));
    hints.testFrameworks?.forEach((t) => testFrameworks.add(t));
    hints.ciSystems?.forEach((c) => ciSystems.add(c));
    if (hints.containerized) containerized = true;
    if (hints.monorepo) monorepo = true;
  }

  for (const f of files) {
    const base = basename(f);
    if (base === "Program.cs" || base === "main.ts" || base === "index.ts" || base === "app.py") {
      entrypoints.add(f);
    }
    if (f.endsWith(".slnx") || f.endsWith(".sln")) {
      entrypoints.add(f);
      frameworks.add("dotnet");
      buildTools.add("dotnet");
    }
    if (f.includes(".github/workflows/")) {
      ciSystems.add("github-actions");
    }
  }

  return {
    frameworks: [...frameworks].sort(),
    packageManagers: [...packageManagers].sort(),
    buildTools: [...buildTools].sort(),
    entrypoints: [...entrypoints].sort(),
    testFrameworks: [...testFrameworks].sort(),
    ciSystems: [...ciSystems].sort(),
    containerized,
    monorepo,
  };
}

export async function detectStack(repoPath: string, options: DetectStackOptions = {}): Promise<StackProfile> {
  const maxFiles = Math.min(options.maxFiles ?? 10_000, MAX_REPO_FILES);
  const excludes = [
    ...DEFAULT_EXCLUDES,
    ...(options.monorepoExcludes !== false ? MONOREPO_MODULE_EXCLUDES : []),
    ...(options.excludePathPatterns ?? []),
  ];
  const files: string[] = [];

  await walkFiles(repoPath, repoPath, excludes, maxFiles, files);

  const languages = countLanguages(files);
  const markers = detectFromMarkers(files);

  const csprojCount = files.filter((f) => f.endsWith(".csproj")).length;
  if (csprojCount > 0) {
    markers.frameworks = [...new Set([...markers.frameworks, "dotnet"])].sort();
    markers.buildTools = [...new Set([...markers.buildTools, "dotnet"])].sort();
  }

  if (markers.monorepo && options.monorepoExcludes !== false) {
    // monorepo hint already set from markers; excludes already applied above
  }

  return {
    detectedAt: new Date().toISOString(),
    repoPath,
    headSha: options.headSha,
    languages,
    ...markers,
    primaryLanguage: languages[0]?.language ?? null,
    scanTruncated: files.length >= maxFiles,
    filesScanned: files.length,
  };
}

export async function writeStackProfile(_repoPath: string, profile: StackProfile, outputDir: string): Promise<string> {
  const { mkdir, writeFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const artifactsDir = join(outputDir, "artifacts");
  await mkdir(artifactsDir, { recursive: true });
  const outPath = join(artifactsDir, "stack-profile.json");
  await writeFile(outPath, JSON.stringify(profile, null, 2), "utf-8");
  return outPath;
}
