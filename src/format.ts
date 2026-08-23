import type { DraftMessage } from "./types.js";

function quote(text: string): string {
  return text
    .trim()
    .split(/\r?\n/)
    .map((line) => `> ${line || " "}`)
    .join("\n");
}

export function formatDraft(messages: DraftMessage[], limit = 60_000): string {
  const sections = messages.map((message) => {
    const metadata = [message.source, message.originalDate]
      .filter(Boolean)
      .join(" · ");
    return [quote(message.text), metadata ? `\n_${metadata}_` : ""].join("");
  });

  const heading = "## Telegram messages\n\n";
  const body = `${heading}${sections.join("\n\n---\n\n")}`;
  if (body.length <= limit) return body;

  const suffix = "\n\n_The forwarded content was truncated by the Telegram–GitHub bridge._";
  return `${body.slice(0, Math.max(0, limit - suffix.length))}${suffix}`;
}

export function shorten(value: string, length: number): string {
  if (value.length <= length) return value;
  return `${value.slice(0, Math.max(0, length - 1)).trimEnd()}…`;
}
