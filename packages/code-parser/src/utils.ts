import type { CodeSymbol } from "./types.js";

const EXTENSION_LANGUAGE: Record<string, string> = {
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".py": "python",
  ".java": "java",
  ".go": "go",
};

export function inferLanguage(filePath: string): string | null {
  const dot = filePath.lastIndexOf(".");
  if (dot === -1) return null;
  const ext = filePath.slice(dot).toLowerCase();
  return EXTENSION_LANGUAGE[ext] ?? null;
}

export function lineCount(content: string): number {
  if (!content) return 0;
  return content.split(/\r?\n/).length;
}

/** Estimates block end by brace/bracket depth from startLine (1-based). */
export function estimateBlockEnd(lines: string[], startLine: number): number {
  const startIdx = startLine - 1;
  if (startIdx < 0 || startIdx >= lines.length) return startLine;

  let depth = 0;
  let started = false;
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i];
    for (const ch of line) {
      if (ch === "{" || ch === "(") {
        depth++;
        started = true;
      } else if (ch === "}" || ch === ")") {
        depth--;
      }
    }
    if (started && depth <= 0) return i + 1;
  }
  return lines.length;
}

export function dedupeSymbols(symbols: CodeSymbol[]): CodeSymbol[] {
  const seen = new Set<string>();
  const out: CodeSymbol[] = [];
  for (const s of symbols) {
    const key = `${s.kind}:${s.name}:${s.startLine}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out.sort((a, b) => a.startLine - b.startLine);
}

/** Estimates Python block end by indentation from startLine (1-based). */
export function estimatePythonBlockEnd(lines: string[], startLine: number): number {
  const startIdx = startLine - 1;
  const indent = lines[startIdx]?.match(/^(\s*)/)?.[1]?.length ?? 0;
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const lineIndent = line.match(/^(\s*)/)?.[1]?.length ?? 0;
    if (lineIndent <= indent) return i;
  }
  return lines.length;
}
