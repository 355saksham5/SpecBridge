import { describe, it, expect } from "vitest";
import { parseSymbols, supportedLanguages } from "../src/index.js";

describe("parseSymbols", () => {
  it("lists supported languages", () => {
    expect(supportedLanguages()).toEqual(expect.arrayContaining(["typescript", "python", "java", "go"]));
  });

  it("extracts TypeScript classes and functions", () => {
    const content = [
      "export class FooService {",
      "  async run() { return 1; }",
      "}",
      "export function helper() { return true; }",
    ].join("\n");

    const result = parseSymbols({ filePath: "src/foo.ts", content });
    expect(result.usedFileFallback).toBe(false);
    expect(result.symbols.map((s) => s.name)).toEqual(expect.arrayContaining(["FooService", "helper"]));
  });

  it("extracts Python classes and functions", () => {
    const content = "class Widget:\n    def render(self):\n        pass\n\ndef main():\n    pass\n";
    const result = parseSymbols({ filePath: "app.py", content });
    expect(result.symbols.map((s) => s.name)).toEqual(expect.arrayContaining(["Widget", "render", "main"]));
  });

  it("extracts Java types and methods", () => {
    const content = [
      "public class OrderService {",
      "  public void process() { }",
      "}",
    ].join("\n");
    const result = parseSymbols({ filePath: "OrderService.java", content });
    expect(result.symbols.map((s) => s.name)).toEqual(expect.arrayContaining(["OrderService", "process"]));
  });

  it("extracts Go types and functions", () => {
    const content = "type Server struct {}\n\nfunc (s *Server) Listen() error { return nil }\n";
    const result = parseSymbols({ filePath: "server.go", content });
    expect(result.symbols.map((s) => s.name)).toEqual(expect.arrayContaining(["Server", "Listen"]));
  });

  it("falls back to file-level symbol for unknown languages", () => {
    const result = parseSymbols({ filePath: "README.md", content: "# hello" });
    expect(result.usedFileFallback).toBe(true);
    expect(result.symbols).toHaveLength(1);
    expect(result.symbols[0].kind).toBe("file");
  });
});
