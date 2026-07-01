import type { CodeSymbol } from "./types.js";
import { dedupeSymbols, estimateBlockEnd } from "./utils.js";

export function parseJavaSymbols(content: string): CodeSymbol[] {
  const lines = content.split(/\r?\n/);
  const symbols: CodeSymbol[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const typeMatch = line.match(/(?:public|private|protected)?\s*(?:static\s+)?(?:final\s+)?(?:class|interface|enum|record)\s+(\w+)/);
    if (typeMatch?.[1]) {
      const kind = line.includes("interface") ? "interface" : "class";
      const startLine = i + 1;
      symbols.push({
        name: typeMatch[1],
        kind,
        startLine,
        endLine: estimateBlockEnd(lines, startLine),
      });
      continue;
    }

    const methodMatch = line.match(/(?:public|private|protected)\s+(?:static\s+)?[\w<>,\[\]\s]+\s+(\w+)\s*\([^)]*\)\s*(?:throws\s+[\w,\s]+)?\s*\{/);
    if (methodMatch?.[1] && methodMatch[1] !== "if" && methodMatch[1] !== "for") {
      const startLine = i + 1;
      symbols.push({
        name: methodMatch[1],
        kind: "method",
        startLine,
        endLine: estimateBlockEnd(lines, startLine),
      });
    }
  }

  return dedupeSymbols(symbols);
}
