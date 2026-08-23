import "dotenv/config";

function requireValue(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function positiveInteger(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

const allowedUsers = new Set(
  (process.env.TELEGRAM_ALLOWED_USER_IDS ?? "")
    .split(",")
    .map((value) => Number.parseInt(value.trim(), 10))
    .filter(Number.isFinite),
);

export const config = {
  telegramBotToken: requireValue("TELEGRAM_BOT_TOKEN"),
  telegramAllowedUsers: allowedUsers,
  githubToken: requireValue("GITHUB_TOKEN"),
  githubApiVersion: process.env.GITHUB_API_VERSION?.trim() || "2026-03-10",
  dataFile: process.env.DATA_FILE?.trim() || "./data/state.json",
  pageSize: positiveInteger("LIST_PAGE_SIZE", 8),
  messageBodyLimit: positiveInteger("MESSAGE_BODY_LIMIT", 60_000),
};
