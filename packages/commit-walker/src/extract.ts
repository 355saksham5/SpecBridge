import type { CommitInfo, CommitWithJira, ExtractJiraKeyOptions } from "./types.js";
import { DEFAULT_ISSUE_KEY_PATTERN } from "./types.js";

export function extractJiraKey(commit: CommitInfo, options: ExtractJiraKeyOptions = {}): string | null {
  const pattern = options.issueKeyPattern ?? DEFAULT_ISSUE_KEY_PATTERN;
  const sources = options.extractFrom ?? ["commit_message"];

  let regex: RegExp;
  try {
    regex = new RegExp(pattern);
  } catch {
    throw new Error(`Invalid issueKeyPattern: ${pattern}`);
  }

  const haystacks: string[] = [];
  if (sources.includes("commit_message")) {
    haystacks.push(commit.message || commit.subject);
  }
  if (sources.includes("branch_name") && options.branchName) {
    haystacks.push(options.branchName);
  }

  for (const text of haystacks) {
    const match = text.match(regex);
    if (match) return match[0];
  }

  return null;
}

export function enrichWithJiraKeys(commits: CommitInfo[], options: ExtractJiraKeyOptions = {}): CommitWithJira[] {
  return commits.map((commit) => {
    const jiraKey = extractJiraKey(commit, options);
    return {
      ...commit,
      jiraKey,
      skippedReason: jiraKey ? null : "no_jira_key",
    };
  });
}
