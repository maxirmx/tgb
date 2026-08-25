import { randomBytes } from "node:crypto";
import { Bot, GrammyError, HttpError } from "grammy";
import type { Context } from "grammy";
import { config } from "./config.js";
import { formatDraft, shorten } from "./format.js";
import { GitHubApiError, GitHubClient } from "./github.js";
import { countDraftImages, uploadDraftImages } from "./images.js";
import {
  draftKeyboard,
  issueKeyboard,
  repositoryKeyboard,
} from "./keyboards.js";
import { StateStore } from "./store.js";
import { isForwardedMessage, toDraftMessage } from "./telegram-message.js";
import type { PendingFlow, UserState } from "./types.js";

const bot = new Bot(config.telegramBotToken);
const github = new GitHubClient({
  token: config.githubToken,
  apiVersion: config.githubApiVersion,
});
const store = new StateStore(config.dataFile);

function flowId(): string {
  return randomBytes(4).toString("hex");
}

function allowed(ctx: Context): boolean {
  return Boolean(ctx.from && config.telegramAllowedUsers.has(ctx.from.id));
}

function errorText(error: unknown): string {
  if (error instanceof GitHubApiError) return error.message;
  if (error instanceof Error) return error.message;
  return "Unexpected error";
}

async function requireDraft(ctx: Context): Promise<UserState | null> {
  const state = await store.getUser(ctx.from!.id);
  if (state.draft.length === 0) {
    await ctx.reply("Forward one or more messages to me first.");
    return null;
  }
  return state;
}

async function updateDraftStatus(ctx: Context, count: number): Promise<void> {
  const userId = ctx.from!.id;
  const state = await store.getUser(userId);
  const text = `${count} message${count === 1 ? "" : "s"} selected.`;
  if (state.statusMessageId && ctx.chat) {
    try {
      await ctx.api.editMessageText(ctx.chat.id, state.statusMessageId, text, {
        reply_markup: draftKeyboard(),
      });
      return;
    } catch {
      // The previous status may be too old or unchanged. Send a fresh one below.
    }
  }

  const status = await ctx.reply(text, { reply_markup: draftKeyboard() });
  await store.updateUser(userId, (user) => {
    user.statusMessageId = status.message_id;
  });
}

async function startIssueFlow(ctx: Context): Promise<void> {
  if (!(await requireDraft(ctx))) return;
  await ctx.reply("Loading repositories…");
  const repositories = await github.listRepositories();
  if (repositories.length === 0) {
    await ctx.reply("No writable repositories with Issues enabled were found.");
    return;
  }

  const flow: PendingFlow = {
    id: flowId(),
    type: "issue",
    stage: "repository",
    repositories,
  };
  await store.updateUser(ctx.from!.id, (state) => {
    state.flow = flow;
  });
  await ctx.reply("Choose the repository:", {
    reply_markup: repositoryKeyboard(repositories, flow.id, config.pageSize).keyboard,
  });
}

async function startCommentFlow(ctx: Context): Promise<void> {
  if (!(await requireDraft(ctx))) return;
  await ctx.reply("Loading repositories…");
  const repositories = await github.listRepositories();
  if (repositories.length === 0) {
    await ctx.reply("No accessible repositories with Issues enabled were found.");
    return;
  }

  const flow: PendingFlow = {
    id: flowId(),
    type: "comment",
    stage: "repository",
    repositories,
  };
  await store.updateUser(ctx.from!.id, (state) => {
    state.flow = flow;
  });
  await ctx.reply("Choose the repository containing the issue:", {
    reply_markup: repositoryKeyboard(repositories, flow.id, config.pageSize).keyboard,
  });
}

async function chooseRepository(ctx: Context, id: string, index: number): Promise<void> {
  const state = await store.getUser(ctx.from!.id);
  const flow = state.flow;
  if (!flow || flow.id !== id || flow.stage !== "repository") {
    await ctx.reply("That selection has expired. Start again from the draft buttons.");
    return;
  }
  const repository = flow.repositories?.[index];
  if (!repository) return;

  if (flow.type === "issue") {
    await store.updateUser(ctx.from!.id, (user) => {
      if (!user.flow || user.flow.id !== id) return;
      user.flow.stage = "title";
      user.flow.selectedRepository = repository.nameWithOwner;
    });
    await ctx.reply(
      `Repository: ${repository.nameWithOwner}\nSend the issue title as your next message.`,
      { reply_markup: { force_reply: true, selective: true } },
    );
    return;
  }

  await ctx.reply("Loading open issues from the repository…");
  const issues = await github.listRepositoryIssues(repository.nameWithOwner);
  if (issues.length === 0) {
    await ctx.reply("This repository contains no visible open issues.");
    return;
  }

  await store.updateUser(ctx.from!.id, (user) => {
    if (!user.flow || user.flow.id !== id) return;
    user.flow.stage = "issue";
    user.flow.selectedRepository = repository.nameWithOwner;
    user.flow.issues = issues;
  });

  await ctx.reply(`Repository: ${repository.nameWithOwner}\nChoose the issue:`, {
    reply_markup: issueKeyboard(issues, id, config.pageSize).keyboard,
  });
}

async function buildDraftBody(
  ctx: Context,
  repository: string,
  state: UserState,
): Promise<string> {
  const count = countDraftImages(state.draft);
  if (!count) return formatDraft(state.draft, config.messageBodyLimit);

  await ctx.reply(`Uploading ${count} image${count === 1 ? "" : "s"}…`);
  const images = await uploadDraftImages({
    telegramApi: bot.api,
    telegramBotToken: config.telegramBotToken,
    github,
    repository,
    messages: state.draft,
    maxBytes: config.imageMaxBytes,
  });
  return formatDraft(state.draft, config.messageBodyLimit, images);
}

async function createIssueFromTitle(ctx: Context, title: string): Promise<void> {
  const userId = ctx.from!.id;
  const state = await store.getUser(userId);
  const flow = state.flow;
  if (!flow || flow.type !== "issue" || flow.stage !== "title" || !flow.selectedRepository) {
    return;
  }

  const cleanTitle = shorten(title.trim(), 240);
  if (!cleanTitle) {
    await ctx.reply("The issue title cannot be empty. Send another title.");
    return;
  }

  const body = await buildDraftBody(ctx, flow.selectedRepository, state);
  await ctx.reply("Creating the GitHub issue…");
  const issue = await github.createIssue(flow.selectedRepository, cleanTitle, body);

  await store.clear(userId);
  await ctx.reply(`Created ${issue.repository} #${issue.number}:\n${issue.url}`);
}

async function createCommentForIssue(ctx: Context, id: string, index: number): Promise<void> {
  const userId = ctx.from!.id;
  const state = await store.getUser(userId);
  const flow = state.flow;
  if (!flow || flow.id !== id || flow.type !== "comment" || flow.stage !== "issue") {
    await ctx.reply("That selection has expired. Start again from the draft buttons.");
    return;
  }
  const issue = flow.issues?.[index];
  if (!issue) return;

  const body = await buildDraftBody(ctx, issue.repository, state);
  await ctx.reply(`Adding a comment to ${issue.repository} #${issue.number}…`);
  const url = await github.createComment(issue.repository, issue.number, body);
  await store.clear(userId);
  await ctx.reply(`Comment created:\n${url}`);
}

async function showPage(ctx: Context, kind: string, id: string, page: number): Promise<void> {
  const state = await store.getUser(ctx.from!.id);
  const flow = state.flow;
  if (!flow || flow.id !== id) {
    await ctx.reply("That selection has expired.");
    return;
  }

  if (kind === "repo" && flow.repositories) {
    await ctx.editMessageReplyMarkup({
      reply_markup: repositoryKeyboard(flow.repositories, id, config.pageSize, page).keyboard,
    });
  } else if (kind === "issue" && flow.issues) {
    await ctx.editMessageReplyMarkup({
      reply_markup: issueKeyboard(flow.issues, id, config.pageSize, page).keyboard,
    });
  }
}

bot.use(async (ctx, next) => {
  const messageText =
    ctx.message && "text" in ctx.message && typeof ctx.message.text === "string"
      ? ctx.message.text
      : undefined;
  const isWhoAmI = messageText?.startsWith("/whoami") ?? false;
  if (isWhoAmI) return next();
  if (!allowed(ctx)) {
    if (ctx.from) {
      await ctx.reply(`This bot is private. Your Telegram user ID is ${ctx.from.id}.`);
    }
    return;
  }
  return next();
});

bot.command("whoami", async (ctx) => {
  if (ctx.from) await ctx.reply(`Your Telegram user ID is ${ctx.from.id}.`);
});

bot.command("start", async (ctx) => {
  await ctx.reply(
    "Forward one or more Telegram messages to me. I will collect them into a draft that you can turn into a GitHub issue or comment.\n\nCommands:\n/clear — discard the draft\n/cancel — cancel the current selection\n/whoami — show your Telegram user ID",
  );
});

bot.command("clear", async (ctx) => {
  if (!ctx.from) return;
  await store.clear(ctx.from.id);
  await ctx.reply("Draft cleared.");
});

bot.command("cancel", async (ctx) => {
  if (!ctx.from) return;
  await store.updateUser(ctx.from.id, (state) => {
    delete state.flow;
  });
  const state = await store.getUser(ctx.from.id);
  await ctx.reply(
    state.draft.length ? "Selection cancelled. Your forwarded messages are still saved." : "Nothing to cancel.",
    state.draft.length ? { reply_markup: draftKeyboard() } : undefined,
  );
});

bot.callbackQuery("noop", async (ctx) => {
  await ctx.answerCallbackQuery();
});

bot.callbackQuery(/^act:(issue|comment|clear|cancel)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  try {
    const action = ctx.match[1];
    if (action === "issue") await startIssueFlow(ctx);
    if (action === "comment") await startCommentFlow(ctx);
    if (action === "clear") {
      await store.clear(ctx.from.id);
      await ctx.reply("Draft cleared.");
    }
    if (action === "cancel") {
      await store.updateUser(ctx.from.id, (state) => {
        delete state.flow;
      });
      await ctx.reply("Selection cancelled. Your forwarded messages are still saved.", {
        reply_markup: draftKeyboard(),
      });
    }
  } catch (error) {
    await ctx.reply(`Could not continue: ${errorText(error)}`);
  }
});

bot.callbackQuery(/^repo:([a-f0-9]+):(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  try {
    await chooseRepository(ctx, ctx.match[1], Number(ctx.match[2]));
  } catch (error) {
    await ctx.reply(`Could not continue: ${errorText(error)}`);
  }
});

bot.callbackQuery(/^issue:([a-f0-9]+):(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  try {
    await createCommentForIssue(ctx, ctx.match[1], Number(ctx.match[2]));
  } catch (error) {
    await ctx.reply(`Could not create the comment: ${errorText(error)}`);
  }
});

bot.callbackQuery(/^nav:(repo|issue):([a-f0-9]+):(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  try {
    await showPage(ctx, ctx.match[1], ctx.match[2], Number(ctx.match[3]));
  } catch (error) {
    await ctx.reply(`Could not change page: ${errorText(error)}`);
  }
});

bot.on("message", async (ctx) => {
  const state = await store.getUser(ctx.from.id);
  const forwarded = isForwardedMessage(ctx.message);
  const messageText = "text" in ctx.message ? ctx.message.text : undefined;

  if (
    state.flow?.type === "issue" &&
    state.flow.stage === "title" &&
    typeof messageText === "string" &&
    !forwarded
  ) {
    try {
      await createIssueFromTitle(ctx, messageText);
    } catch (error) {
      await ctx.reply(`Could not create the issue: ${errorText(error)}\nYour draft is still saved.`);
    }
    return;
  }

  const draftMessage = toDraftMessage(ctx.message);
  if (!draftMessage) {
    await ctx.reply(
      "This version supports text, captions, photos, image documents, and common media placeholders.",
    );
    return;
  }
  const count = await store.addDraftMessage(ctx.from.id, draftMessage);
  await updateDraftStatus(ctx, count);
});

bot.catch((error) => {
  const cause = error.error;
  if (cause instanceof GrammyError) {
    console.error("Telegram API error:", cause.description);
  } else if (cause instanceof HttpError) {
    console.error("Telegram network error:", cause);
  } else {
    console.error("Unhandled bot error:", cause);
  }
});

async function main(): Promise<void> {
  await store.init();
  const githubLogin = await github.verify();
  const botUser = await bot.api.getMe();
  console.log(`GitHub authenticated as ${githubLogin}`);
  console.log(`Telegram bot @${botUser.username} is starting with long polling`);
  if (config.telegramAllowedUsers.size === 0) {
    console.warn("No Telegram users are allowed yet. Send /whoami, update .env, and restart.");
  }
  await bot.start({
    allowed_updates: ["message", "callback_query"],
    onStart: () => console.log("Telegram–GitHub bridge is ready"),
  });
}

main().catch((error) => {
  console.error("Startup failed:", error);
  process.exitCode = 1;
});
