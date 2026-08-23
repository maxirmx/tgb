import type { Message } from "grammy/types";
import type { DraftMessage } from "./types.js";

type AnyMessage = Message & Record<string, unknown>;

function mediaDescription(message: AnyMessage): string | undefined {
  if ("photo" in message) return "[Photo]";
  if ("video" in message) return "[Video]";
  if ("voice" in message) return "[Voice message]";
  if ("audio" in message) return "[Audio]";
  if ("animation" in message) return "[Animation]";
  if ("sticker" in message) return "[Sticker]";
  if ("document" in message) {
    const document = message.document as { file_name?: string } | undefined;
    return document?.file_name ? `[Document: ${document.file_name}]` : "[Document]";
  }
  return undefined;
}

function forwardedSource(message: AnyMessage): { source?: string; originalDate?: string } {
  const origin = message.forward_origin as
    | {
        type?: string;
        date?: number;
        sender_user?: { first_name?: string; last_name?: string; username?: string };
        sender_user_name?: string;
        sender_chat?: { title?: string; username?: string };
        chat?: { title?: string; username?: string };
        author_signature?: string;
      }
    | undefined;

  if (!origin?.type) return {};

  let source = "Forwarded from Telegram";
  if (origin.type === "user" && origin.sender_user) {
    const name = [origin.sender_user.first_name, origin.sender_user.last_name]
      .filter(Boolean)
      .join(" ");
    source = name || origin.sender_user.username || source;
  } else if (origin.type === "hidden_user" && origin.sender_user_name) {
    source = origin.sender_user_name;
  } else {
    const chat = origin.chat ?? origin.sender_chat;
    source = chat?.title || chat?.username || origin.author_signature || source;
  }

  return {
    source: `Telegram: ${source}`,
    originalDate: origin.date ? new Date(origin.date * 1000).toISOString() : undefined,
  };
}

export function isForwardedMessage(message: Message): boolean {
  return Boolean((message as AnyMessage).forward_origin);
}

export function toDraftMessage(message: Message): DraftMessage | null {
  const anyMessage = message as AnyMessage;
  const text =
    ("text" in anyMessage ? String(anyMessage.text) : undefined) ||
    ("caption" in anyMessage ? String(anyMessage.caption) : undefined) ||
    mediaDescription(anyMessage);

  if (!text) return null;
  const forwarded = forwardedSource(anyMessage);
  return {
    telegramMessageId: message.message_id,
    text,
    ...forwarded,
    receivedAt: new Date(message.date * 1000).toISOString(),
  };
}
