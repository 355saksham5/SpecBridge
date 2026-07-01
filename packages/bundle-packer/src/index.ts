import { createHash } from "node:crypto";
import { readdir, readFile, stat, copyFile, mkdir, writeFile } from "node:fs/promises";
import { join, relative, dirname } from "node:path";
import archiver from "archiver";
import { createWriteStream } from "node:fs";
import type { GranularityPrompt } from "@specbridge/knowledge-store";

export type BundleFile = {
  path: string;
  sha256: string;
  sizeBytes: number;
  description?: string;
};

export type SpecbridgeManifest = {
  specbridgeVersion: string;
  jobId: string;
  generatedAt: string;
  repository: {
    repoUrl: string;
    headSha: string;
    branch: string;
  };
  sddKit: {
    id: string;
    version: string;
    vendoredAt: string;
  };
  knowledge: {
    granularityPrompt: GranularityPrompt;
    advisorPrompt?: string | null;
    tokenEstimateStart: number;
    tokenEstimateEnd: number;
    tokenReduction: string;
    shardCount: number;
    commitDepth: number;
    commitsProcessed: number;
    commitsSkipped: number;
    meanQaScore?: number | null;
    calibrationOverlapMean?: number | null;
  };
  files: {
    sddKit: BundleFile[];
    truthDocs: BundleFile[];
    knowledgeShards: BundleFile[];
    retroFeatures?: BundleFile[];
    reports?: BundleFile[];
  };
  pullRequest?: {
    url: string;
    number: number;
    branch: string;
  } | null;
  metadata?: {
    organizationId?: string;
    tags?: string[];
  };
};

export type PackBundleOptions = {
  jobId: string;
  workspaceDir: string;
  outputZipPath: string;
  repoUrl: string;
  headSha: string;
  branch: string;
  sddKit: { id: string; version: string; sourceDir: string };
  knowledge: SpecbridgeManifest["knowledge"];
  organizationId?: string;
  pullRequest?: SpecbridgeManifest["pullRequest"];
};

export async function sha256File(filePath: string): Promise<{ sha256: string; sizeBytes: number }> {
  const content = await readFile(filePath);
  return {
    sha256: createHash("sha256").update(content).digest("hex"),
    sizeBytes: content.length,
  };
}

export async function sha256Content(content: string | Buffer): Promise<string> {
  return createHash("sha256").update(content).digest("hex");
}

export function computeTokenReduction(start: number, end: number): string {
  if (start === 0) return "0%";
  const pct = Math.max(0, ((start - end) / start) * 100);
  return `${Math.round(pct * 10) / 10}%`;
}

async function collectFiles(dir: string, baseDir: string, acc: string[] = []): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return acc;
  }

  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectFiles(full, baseDir, acc);
    } else {
      acc.push(relative(baseDir, full).replace(/\\/g, "/"));
    }
  }
  return acc;
}

async function bundleFileEntry(workspaceDir: string, relPath: string, description?: string): Promise<BundleFile> {
  const full = join(workspaceDir, relPath);
  const { sha256, sizeBytes } = await sha256File(full);
  return { path: relPath.replace(/\\/g, "/"), sha256, sizeBytes, description };
}

export async function buildManifestFromWorkspace(options: PackBundleOptions): Promise<SpecbridgeManifest> {
  const ws = options.workspaceDir;

  const sddKitPaths: string[] = [];
  for (const rel of [".cursor", "AGENTS.md", "USAGE_GUIDE.md"]) {
    const full = join(options.sddKit.sourceDir, rel);
    try {
      const s = await stat(full);
      if (s.isDirectory()) {
        const files = await collectFiles(full, options.sddKit.sourceDir);
        sddKitPaths.push(...files.map((f) => join(rel, f).replace(/\\/g, "/")));
      } else {
        sddKitPaths.push(rel);
      }
    } catch {
      // Kit file may not exist in dev — skip
    }
  }

  const truthDocPaths = [
    ".sdd/docs/project_knowledge.md",
    ".sdd/docs/project_deployment_knowledge.md",
  ];

  const knowledgePaths = await collectFiles(join(ws, ".sdd", "knowledge"), ws).catch(() => [] as string[]);
  const retroPaths = await collectFiles(join(ws, ".sdd", "features", "completed"), ws).catch(() => [] as string[]);
  const reportPaths = await collectFiles(join(ws, ".sdd", "reports"), ws).catch(() => [] as string[]);

  const sddKitFiles: BundleFile[] = [];
  for (const p of sddKitPaths) {
    try {
      sddKitFiles.push(await bundleFileEntry(options.sddKit.sourceDir, p));
    } catch {
      // skip missing
    }
  }

  const truthDocs: BundleFile[] = [];
  for (const p of truthDocPaths) {
    try {
      truthDocs.push(await bundleFileEntry(ws, p, p.includes("deployment") ? "Deployment knowledge" : "Project knowledge"));
    } catch {
      // Placeholder for bootstrap-only runs
    }
  }

  const knowledgeShards: BundleFile[] = [];
  for (const p of knowledgePaths) {
    knowledgeShards.push(await bundleFileEntry(ws, p));
  }

  const retroFeatures: BundleFile[] = [];
  for (const p of retroPaths) {
    retroFeatures.push(await bundleFileEntry(ws, p));
  }

  const reports: BundleFile[] = [];
  for (const p of reportPaths) {
    reports.push(await bundleFileEntry(ws, p));
  }

  return {
    specbridgeVersion: "1.0",
    jobId: options.jobId,
    generatedAt: new Date().toISOString(),
    repository: {
      repoUrl: options.repoUrl,
      headSha: options.headSha,
      branch: options.branch,
    },
    sddKit: {
      id: options.sddKit.id,
      version: options.sddKit.version,
      vendoredAt: new Date().toISOString(),
    },
    knowledge: options.knowledge,
    files: {
      sddKit: sddKitFiles,
      truthDocs,
      knowledgeShards,
      retroFeatures: retroFeatures.length ? retroFeatures : undefined,
      reports: reports.length ? reports : undefined,
    },
    pullRequest: options.pullRequest ?? null,
    metadata: options.organizationId ? { organizationId: options.organizationId } : undefined,
  };
}

export async function vendorSddKit(sourceDir: string, targetDir: string): Promise<void> {
  for (const rel of [".cursor", "AGENTS.md", "USAGE_GUIDE.md"]) {
    const src = join(sourceDir, rel);
    const dest = join(targetDir, rel);
    try {
      const s = await stat(src);
      if (s.isDirectory()) {
        await copyDir(src, dest);
      } else {
        await mkdir(dirname(dest), { recursive: true });
        await copyFile(src, dest);
      }
    } catch {
      // skip
    }
  }
}

async function copyDir(src: string, dest: string): Promise<void> {
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await copyFile(srcPath, destPath);
    }
  }
}

export async function packBundle(options: PackBundleOptions): Promise<{ zipPath: string; manifest: SpecbridgeManifest; sizeBytes: number }> {
  const manifest = await buildManifestFromWorkspace(options);
  const manifestJson = JSON.stringify(manifest, null, 2);

  await mkdir(dirname(options.outputZipPath), { recursive: true });

  const output = createWriteStream(options.outputZipPath);
  const archive = archiver("zip", { zlib: { level: 9 } });

  const done = new Promise<void>((resolve, reject) => {
    output.on("close", () => resolve());
    archive.on("error", reject);
  });

  archive.pipe(output);

  // SDD kit files from source
  for (const file of manifest.files.sddKit) {
    archive.file(join(options.sddKit.sourceDir, file.path), { name: file.path });
  }

  // Workspace artifacts
  const allWorkspaceFiles = [
    ...manifest.files.truthDocs,
    ...manifest.files.knowledgeShards,
    ...(manifest.files.retroFeatures ?? []),
    ...(manifest.files.reports ?? []),
  ];

  for (const file of allWorkspaceFiles) {
    archive.file(join(options.workspaceDir, file.path), { name: file.path });
  }

  archive.append(manifestJson, { name: "specbridge.manifest.json" });
  await archive.finalize();
  await done;

  const zipStat = await stat(options.outputZipPath);
  return { zipPath: options.outputZipPath, manifest, sizeBytes: zipStat.size };
}

export async function writeManifest(manifest: SpecbridgeManifest, outputPath: string): Promise<void> {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(manifest, null, 2), "utf-8");
}
