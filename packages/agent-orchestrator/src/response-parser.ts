/**
 * Extracts a JSON value from an agent's free-form text response.
 *
 * Agents are instructed (see prompts.ts) to respond with JSON only, but LLM output can still
 * include a markdown code fence or incidental prose around the payload. This tolerates both
 * while staying strict about what it ultimately accepts as valid JSON — callers are expected to
 * further validate the parsed shape (e.g. via `HandoffValidator`) before trusting it.
 */
export function extractJson<T = unknown>(text: string | undefined | null): T | null {
  if (!text) return null;
  const stripped = stripCodeFence(text.trim());
  if (!stripped) return null;

  const direct = tryParse<T>(stripped);
  if (direct !== null) return direct;

  const balanced = extractBalancedJson(stripped);
  if (balanced) {
    const parsed = tryParse<T>(balanced);
    if (parsed !== null) return parsed;
  }

  return null;
}

function stripCodeFence(text: string): string {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return fenceMatch ? fenceMatch[1].trim() : text;
}

function tryParse<T>(text: string): T | null {
  try {
    const parsed = JSON.parse(text);
    return parsed === null ? null : (parsed as T);
  } catch {
    return null;
  }
}

/** Finds the first balanced `{...}` or `[...]` substring, tolerating leading/trailing prose. */
function extractBalancedJson(text: string): string | null {
  for (const [opener, closer] of [
    ["{", "}"],
    ["[", "]"],
  ] as const) {
    const start = text.indexOf(opener);
    if (start === -1) continue;

    let depth = 0;
    let inString = false;
    let escapeNext = false;

    for (let i = start; i < text.length; i++) {
      const char = text[i];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      if (char === "\\" && inString) {
        escapeNext = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;

      if (char === opener) depth++;
      else if (char === closer) {
        depth--;
        if (depth === 0) return text.slice(start, i + 1);
      }
    }
  }
  return null;
}
