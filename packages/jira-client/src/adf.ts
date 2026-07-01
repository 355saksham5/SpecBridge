/**
 * Minimal Atlassian Document Format (ADF) to plain-text converter.
 * Jira Cloud v3 API returns `description` as ADF; we only need readable
 * text for agent prompts, not a full rich-text renderer.
 */

type AdfNode = {
  type?: string;
  text?: string;
  content?: AdfNode[];
  attrs?: Record<string, unknown>;
};

const MAX_TEXT_LENGTH = 20_000;

export function adfToText(doc: unknown): string {
  if (!doc || typeof doc !== "object") return "";
  const text = renderNode(doc as AdfNode).trim();
  return text.length > MAX_TEXT_LENGTH ? `${text.slice(0, MAX_TEXT_LENGTH)}\n[truncated]` : text;
}

function renderNode(node: AdfNode): string {
  if (!node) return "";

  switch (node.type) {
    case "text":
      return node.text ?? "";
    case "hardBreak":
      return "\n";
    case "paragraph":
      return `${renderChildren(node)}\n\n`;
    case "heading": {
      const level = Number(node.attrs?.level ?? 1);
      return `${"#".repeat(Math.min(level, 6))} ${renderChildren(node)}\n\n`;
    }
    case "bulletList":
    case "orderedList":
      return `${renderChildren(node)}\n`;
    case "listItem":
      return `- ${renderChildren(node).trim()}\n`;
    case "codeBlock":
      return `\`\`\`\n${renderChildren(node)}\n\`\`\`\n\n`;
    case "blockquote":
      return `> ${renderChildren(node).trim()}\n\n`;
    case "rule":
      return "---\n\n";
    default:
      return renderChildren(node);
  }
}

function renderChildren(node: AdfNode): string {
  if (!node.content) return "";
  return node.content.map(renderNode).join("");
}
