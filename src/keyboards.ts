import { InlineKeyboard } from "grammy";
import { shorten } from "./format.js";
import type { IssueRef, RepositoryRef } from "./types.js";

export function draftKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("Create issue", "act:issue")
    .text("Add comment", "act:comment")
    .row()
    .text("Clear", "act:clear");
}

interface PageResult {
  keyboard: InlineKeyboard;
  page: number;
  pages: number;
}

function paginatedKeyboard<T>(options: {
  values: T[];
  page: number;
  pageSize: number;
  flowId: string;
  kind: "repo" | "issue";
  label: (value: T) => string;
  callbackPrefix: string;
}): PageResult {
  const pages = Math.max(1, Math.ceil(options.values.length / options.pageSize));
  const page = Math.min(Math.max(0, options.page), pages - 1);
  const start = page * options.pageSize;
  const keyboard = new InlineKeyboard();

  options.values.slice(start, start + options.pageSize).forEach((value, localIndex) => {
    const index = start + localIndex;
    keyboard.text(shorten(options.label(value), 54), `${options.callbackPrefix}:${options.flowId}:${index}`).row();
  });

  if (pages > 1) {
    if (page > 0) keyboard.text("‹ Previous", `nav:${options.kind}:${options.flowId}:${page - 1}`);
    keyboard.text(`${page + 1}/${pages}`, "noop");
    if (page < pages - 1) keyboard.text("Next ›", `nav:${options.kind}:${options.flowId}:${page + 1}`);
    keyboard.row();
  }
  keyboard.text("Cancel", "act:cancel");
  return { keyboard, page, pages };
}

export function repositoryKeyboard(
  repositories: RepositoryRef[],
  flowId: string,
  pageSize: number,
  page = 0,
): PageResult {
  return paginatedKeyboard({
    values: repositories,
    page,
    pageSize,
    flowId,
    kind: "repo",
    callbackPrefix: "repo",
    label: (repository) => repository.nameWithOwner,
  });
}

export function issueKeyboard(
  issues: IssueRef[],
  flowId: string,
  pageSize: number,
  page = 0,
): PageResult {
  return paginatedKeyboard({
    values: issues,
    page,
    pageSize,
    flowId,
    kind: "issue",
    callbackPrefix: "issue",
    label: (issue) => `#${issue.number} · ${issue.title}`,
  });
}
