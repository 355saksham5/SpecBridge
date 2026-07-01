export type SymbolKind = "function" | "class" | "interface" | "method" | "type" | "namespace" | "file";

export type CodeSymbol = {
  name: string;
  kind: SymbolKind;
  /** 1-based start line in source file */
  startLine: number;
  /** 1-based end line (inclusive); estimated when block boundaries are ambiguous */
  endLine: number;
};

export type ParseSymbolsOptions = {
  filePath: string;
  content: string;
  /** When omitted, inferred from file extension. */
  language?: string;
  /** When true and no symbols found, return a single file-level symbol. Default true. */
  fileFallback?: boolean;
};

export type ParseSymbolsResult = {
  language: string;
  symbols: CodeSymbol[];
  usedFileFallback: boolean;
};
