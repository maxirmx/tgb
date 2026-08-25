import type { DraftMessage, EmbeddedImage } from "./types.js";

function quote(text: string): string {
  return text
    .trim()
    .split(/\r?\n/)
    .map((line) => `> ${line || " "}`)
    .join("\n");
}

function imageMarkdown(image: EmbeddedImage): string {
  const alt = image.alt
    .replaceAll("\\", "\\\\")
    .replaceAll("\r", " ")
    .replaceAll("\n", " ")
    .replaceAll("[", "\\[")
    .replaceAll("]", "\\]");
  return `![${alt}](${image.url})`;
}

function formatSections(
  messages: DraftMessage[],
  imagesByMessage: ReadonlyMap<number, EmbeddedImage[]>,
): string {
  return messages
    .map((message) => {
      const metadata = [message.source, message.originalDate].filter(Boolean).join(" · ");
      const images = imagesByMessage.get(message.telegramMessageId)?.map(imageMarkdown).join("\n\n");
      return [quote(message.text), images, metadata ? `_${metadata}_` : ""]
        .filter(Boolean)
        .join("\n\n");
    })
    .join("\n\n---\n\n");
}

export function formatDraft(
  messages: DraftMessage[],
  limit = 60_000,
  embeddedImages: EmbeddedImage[] = [],
): string {
  const imagesByMessage = new Map<number, EmbeddedImage[]>();
  for (const image of embeddedImages) {
    const images = imagesByMessage.get(image.telegramMessageId) ?? [];
    images.push(image);
    imagesByMessage.set(image.telegramMessageId, images);
  }

  const heading = "## Telegram messages\n\n";
  const body = `${heading}${formatSections(messages, imagesByMessage)}`;
  if (body.length <= limit) return body;

  const suffix = "\n\n_The forwarded content was truncated by the Telegram–GitHub bridge._";
  const imageBlock = embeddedImages.length
    ? `\n\n## Telegram images\n\n${embeddedImages.map(imageMarkdown).join("\n\n")}`
    : "";
  if (heading.length + imageBlock.length + suffix.length > limit) {
    throw new Error("Embedded image links exceed the configured message body limit");
  }
  const textOnly = formatSections(messages, new Map());
  const availableText = Math.max(0, limit - heading.length - imageBlock.length - suffix.length);
  return `${heading}${textOnly.slice(0, availableText)}${imageBlock}${suffix}`;
}

export function shorten(value: string, length: number): string {
  if (value.length <= length) return value;
  return `${value.slice(0, Math.max(0, length - 1)).trimEnd()}…`;
}
