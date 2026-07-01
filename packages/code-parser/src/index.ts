import type { ParseSymbolsOptions, ParseSymbolsResult } from "./types.js";
import { inferLanguage, lineCount } from "./utils.js";
import { parseTypeScriptSymbols } from "./typescript.js";
import { parsePythonSymbols } from "./python.js";
import { parseJavaSymbols } from "./java.js";
import { parseGoSymbols } from "./go.js";

const PARSERS: Record<string, (content: string) => import("./types.js").CodeSymbol[]> = {
  typescript: parseTypeScriptSymbols,
  javascript: parseTypeScriptSymbols,
  python: parsePythonSymbols,
  java: parseJavaSymbols,
  go: parseGoSymbols,
};

/**
 * Extracts top-level symbols from source for shard boundary hints.
 * Uses language-specific line parsers (tree-sitter WASM can replace these
 * backends behind the same interface in a future hardening pass).
 * Falls back to a single file-level symbol when no symbols are found.
 */
export function parseSymbols(options: ParseSymbolsOptions): ParseSymbolsResult {
  const language = options.language ?? inferLanguage(options.filePath) ?? "unknown";
  const fileFallback = options.fileFallback !== false;
  const parser = PARSERS[language];

  let symbols = parser ? parser(options.content) : [];
  let usedFileFallback = false;

  if (symbols.length === 0 && fileFallback) {
    symbols = [
      {
        name: options.filePath.split(/[/\\]/).pop() ?? "file",
        kind: "file",
        startLine: 1,
        endLine: Math.max(1, lineCount(options.content)),
      },
    ];
    usedFileFallback = true;
  }

  return { language, symbols, usedFileFallback };
}

export function supportedLanguages(): string[] {
  return Object.keys(PARSERS);
}
