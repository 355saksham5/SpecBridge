import type { CodeSymbol } from "./types.js";
import { dedupeSymbols, estimateBlockEnd } from "./utils.js";

export function parseGoSymbols(content: string): CodeSymbol[] {
  const lines = content.split(/\r?\n/);
  const symbols: CodeSymbol[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const typeMatch = line.match(/^type\s+(\w+)\s+(?:struct|interface)\b/);
    if (typeMatch?.[1]) {
      const startLine = i + 1;
      symbols.push({
        name: typeMatch[1],
        kind: line.includes("interface") ? "interface" : "class",
        startLine,
        endLine: estimateBlockEnd(lines, startLine),
      });
      continue;
    }

    const funcMatch = line.match(/^func\s+(?:\([^)]+\)\s+)?(\w+)\s*\(/);
    if (funcMatch?.[1]) {
      const startLine = i + 1;
      symbols.push({
        name: funcMatch[1],
        kind: "function",
        startLine,
        endLine: estimateGoBlockEnd(lines, startLine),
      });
    }
  }

  return dedupeSymbols(symbols);
}

function estimateGoBlockEnd(lines: string[], startLine: number): number {
  const startIdx = startLine - 1;
  for (let i = startIdx + 1; i < lines.length; i++) {
    if (/^func\s/.test(lines[i])) return i;
  }
  return lines.length;
}
