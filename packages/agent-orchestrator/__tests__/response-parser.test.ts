import { describe, it, expect } from "vitest";
import { extractJson } from "../src/response-parser.js";

describe("extractJson", () => {
  it("parses a raw JSON object response", () => {
    expect(extractJson('{"questions":["a","b"]}')).toEqual({ questions: ["a", "b"] });
  });

  it("parses JSON wrapped in a ```json fence", () => {
    const text = ['```json', '{"overallPass": true, "patches": []}', '```'].join("\n");
    expect(extractJson(text)).toEqual({ overallPass: true, patches: [] });
  });

  it("parses JSON wrapped in a plain ``` fence", () => {
    const text = ["```", '{"a": 1}', "```"].join("\n");
    expect(extractJson(text)).toEqual({ a: 1 });
  });

  it("extracts a balanced JSON object surrounded by prose", () => {
    const text = 'Sure, here is the result:\n{"a": 1, "b": {"c": 2}}\nLet me know if you need anything else.';
    expect(extractJson(text)).toEqual({ a: 1, b: { c: 2 } });
  });

  it("does not get confused by braces inside string values", () => {
    const text = '{"note": "use {curly} braces carefully", "ok": true}';
    expect(extractJson(text)).toEqual({ note: "use {curly} braces carefully", ok: true });
  });

  it("extracts a balanced JSON array surrounded by prose", () => {
    const text = "Here are the items: [1, 2, 3] — done.";
    expect(extractJson<number[]>(text)).toEqual([1, 2, 3]);
  });

  it("returns null for prose with no JSON", () => {
    expect(extractJson("I completed the task successfully with no issues.")).toBeNull();
  });

  it("returns null for empty or missing input", () => {
    expect(extractJson("")).toBeNull();
    expect(extractJson(undefined)).toBeNull();
    expect(extractJson(null)).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    expect(extractJson("{not valid json")).toBeNull();
  });
});
