import type { ConfluenceClient } from "./client.js";
import type { ConfluencePage } from "./types.js";

export type ConfluenceContextResult = {
  markdown: string;
  pages: ConfluencePage[];
  missingPageIds: string[];
};

/** Caps the combined context so a handful of large pages can't blow the prompt budget. */
const MAX_CONTEXT_CHARS = 60_000;
/** Bounds how many pages a single job can pull in, independent of page size. */
const MAX_PAGE_IDS = 25;

export async function buildConfluenceContext(client: ConfluenceClient, pageIds: string[]): Promise<ConfluenceContextResult> {
  const boundedIds = [...new Set(pageIds)].slice(0, MAX_PAGE_IDS);
  const fetched = await client.getPages(boundedIds);

  const pages: ConfluencePage[] = [];
  const missingPageIds: string[] = [];
  for (const id of boundedIds) {
    const page = fetched.get(id);
    if (page) pages.push(page);
    else missingPageIds.push(id);
  }

  const sections = pages.map((page) => `## ${page.title}\n\nSource: ${page.url}\n\n${page.markdown}`);
  let markdown = sections.length > 0
    ? `# Confluence Context\n\n${sections.join("\n\n---\n\n")}`
    : "";

  if (markdown.length > MAX_CONTEXT_CHARS) {
    markdown = `${markdown.slice(0, MAX_CONTEXT_CHARS)}\n\n_[truncated — context exceeded ${MAX_CONTEXT_CHARS} characters]_`;
  }

  return { markdown, pages, missingPageIds };
}
