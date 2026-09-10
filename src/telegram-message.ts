// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the tgb application

import type { Document, Message, PhotoSize } from "grammy/types";
import type { DraftImage, DraftMessage } from "./types.js";

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

function messageImages(message: AnyMessage): DraftImage[] {
  const photos = message.photo as PhotoSize[] | undefined;
  if (photos?.length) {
    const largest = photos.reduce((best, photo) =>
      photo.width * photo.height > best.width * best.height ? photo : best,
    );
    return [
      {
        fileId: largest.file_id,
        fileUniqueId: largest.file_unique_id,
        fileName: `${largest.file_unique_id}.jpg`,
        mimeType: "image/jpeg",
        fileSize: largest.file_size,
      },
    ];
  }

  const document = message.document as Document | undefined;
  if (document?.mime_type?.toLowerCase().startsWith("image/")) {
    return [
      {
        fileId: document.file_id,
        fileUniqueId: document.file_unique_id,
        fileName: document.file_name,
        mimeType: document.mime_type,
        fileSize: document.file_size,
      },
    ];
  }

  return [];
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
  const images = messageImages(anyMessage);
  const text =
    ("text" in anyMessage ? String(anyMessage.text) : undefined) ||
    ("caption" in anyMessage ? String(anyMessage.caption) : undefined) ||
    mediaDescription(anyMessage);

  if (!text) return null;
  const forwarded = forwardedSource(anyMessage);
  return {
    telegramMessageId: message.message_id,
    text,
    ...(images.length ? { images } : {}),
    ...forwarded,
    receivedAt: new Date(message.date * 1000).toISOString(),
  };
}
