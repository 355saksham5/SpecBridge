export type WalkOrder = "oldest_first" | "newest_first";

export type JiraExtractSource = "commit_message" | "branch_name";

export type CommitInfo = {
  sha: string;
  parentSha: string | null;
  authorName: string;
  authorDate: string;
  subject: string;
  message: string;
};

export type CommitWithJira = CommitInfo & {
  jiraKey: string | null;
  skippedReason: "no_jira_key" | null;
};

export type WalkCommitsOptions = {
  repoPath: string;
  ref?: string;
  commitDepth?: number;
  walkOrder?: WalkOrder;
};

export type ExtractJiraKeyOptions = {
  issueKeyPattern?: string;
  extractFrom?: JiraExtractSource[];
  branchName?: string;
};

export type ChangedPath = {
  path: string;
  status: "added" | "modified" | "deleted" | "renamed" | "copied" | "unknown";
  renamedFrom?: string;
};

export type CommitDiff = {
  sha: string;
  parentSha: string | null;
  changedPaths: ChangedPath[];
};

export const EMPTY_TREE_SHA = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

export const DEFAULT_ISSUE_KEY_PATTERN = "ITDIGIT-\\d+";
