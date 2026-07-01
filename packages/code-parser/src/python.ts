import type { CodeSymbol } from "./types.js";
import { dedupeSymbols, estimatePythonBlockEnd } from "./utils.js";

export function parsePythonSymbols(content: string): CodeSymbol[] {
  const lines = content.split(/\r?\n/);
  const symbols: CodeSymbol[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const classMatch = line.match(/^class\s+(\w+)/);
    if (classMatch?.[1]) {
      const startLine = i + 1;
      symbols.push({
        name: classMatch[1],
        kind: "class",
        startLine,
        endLine: estimatePythonBlockEnd(lines, startLine),
      });
      continue;
    }

    const defMatch = line.match(/^\s*(?:async\s+)?def\s+(\w+)\s*\(/);
    if (defMatch?.[1]) {
      const startLine = i + 1;
      symbols.push({
        name: defMatch[1],
        kind: line.startsWith(" ") || line.startsWith("\t") ? "method" : "function",
        startLine,
        endLine: estimatePythonBlockEnd(lines, startLine),
      });
    }
  }

  return dedupeSymbols(symbols);
}
