import type { CodeSymbol } from "./types.js";
import { dedupeSymbols, estimateBlockEnd } from "./utils.js";

const TS_PATTERNS: Array<{ kind: CodeSymbol["kind"]; regex: RegExp }> = [
  { kind: "class", regex: /^\s*export\s+(?:abstract\s+)?class\s+(\w+)/ },
  { kind: "class", regex: /^\s*class\s+(\w+)/ },
  { kind: "interface", regex: /^\s*export\s+interface\s+(\w+)/ },
  { kind: "interface", regex: /^\s*interface\s+(\w+)/ },
  { kind: "type", regex: /^\s*export\s+type\s+(\w+)/ },
  { kind: "function", regex: /^\s*export\s+(?:async\s+)?function\s+(\w+)/ },
  { kind: "function", regex: /^\s*(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*(?::\s*[\w<>,\s|]+)?\s*=>/ },
  { kind: "function", regex: /^\s*(?:public|private|protected)?\s*(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::\s*[\w<>,\s|]+)?\s*\{/ },
];

export function parseTypeScriptSymbols(content: string): CodeSymbol[] {
  const lines = content.split(/\r?\n/);
  const symbols: CodeSymbol[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const { kind, regex } of TS_PATTERNS) {
      const match = line.match(regex);
      if (!match?.[1]) continue;
      const startLine = i + 1;
      symbols.push({
        name: match[1],
        kind,
        startLine,
        endLine: estimateBlockEnd(lines, startLine),
      });
      break;
    }
  }

  return dedupeSymbols(symbols);
}
