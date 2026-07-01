import { NodeHtmlMarkdown } from "node-html-markdown";

const converter = new NodeHtmlMarkdown({
  bulletMarker: "-",
  codeFence: "```",
});

/**
 * Confluence "storage format" is XHTML plus Confluence-specific `<ac:*>` /
 * `<ri:*>` macro tags. We don't attempt to interpret macros (info panels,
 * embedded Jira issues, etc.) — they render as their inner text, which is a
 * reasonable best-effort for advisory context fed to an LLM prompt.
 */
export function confluenceStorageToMarkdown(storageHtml: string): string {
  if (!storageHtml || !storageHtml.trim()) return "";
  return converter.translate(storageHtml).trim();
}
