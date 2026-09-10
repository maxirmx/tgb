// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the tgb application

import { createHash } from "node:crypto";
import { extname } from "node:path";
import type { DraftImage, DraftMessage, EmbeddedImage } from "./types.js";

interface TelegramFileApi {
  getFile(fileId: string): Promise<{ file_path?: string; file_size?: number }>;
}

interface ImageUploader {
  uploadImage(
    repository: string,
    name: string,
    content: Uint8Array,
    contentType: string,
  ): Promise<string>;
}

interface UploadDraftImagesOptions {
  telegramApi: TelegramFileApi;
  telegramBotToken: string;
  github: ImageUploader;
  repository: string;
  messages: DraftMessage[];
  maxBytes: number;
}

const mimeExtensions: Record<string, string> = {
  "image/avif": ".avif",
  "image/gif": ".gif",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/svg+xml": ".svg",
  "image/webp": ".webp",
};

function imageExtension(image: DraftImage, telegramPath: string): string {
  const mimeExtension = image.mimeType && mimeExtensions[image.mimeType.toLowerCase()];
  if (mimeExtension) return mimeExtension;
  const candidate = extname(image.fileName || telegramPath).toLowerCase();
  if (/^\.[a-z0-9]{1,8}$/.test(candidate)) return candidate;
  return ".jpg";
}

function releaseAssetName(image: DraftImage, telegramPath: string): string {
  const id = createHash("sha256").update(image.fileUniqueId).digest("hex").slice(0, 32);
  return `issue-image-${id}${imageExtension(image, telegramPath)}`;
}

function telegramDownloadUrl(token: string, filePath: string): string {
  const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");
  return `https://api.telegram.org/file/bot${token}/${encodedPath}`;
}

function imageCount(messages: DraftMessage[]): number {
  return messages.reduce((count, message) => count + (message.images?.length ?? 0), 0);
}

export function countDraftImages(messages: DraftMessage[]): number {
  return imageCount(messages);
}

export async function uploadDraftImages(
  options: UploadDraftImagesOptions,
): Promise<EmbeddedImage[]> {
  const uploaded: EmbeddedImage[] = [];
  const total = imageCount(options.messages);
  let imageNumber = 0;

  for (const message of options.messages) {
    for (const image of message.images ?? []) {
      imageNumber += 1;
      if (image.fileSize && image.fileSize > options.maxBytes) {
        throw new Error(`Telegram image ${imageNumber} exceeds the configured size limit`);
      }

      const file = await options.telegramApi.getFile(image.fileId);
      if (!file.file_path) throw new Error(`Telegram did not return a path for image ${imageNumber}`);
      if (file.file_size && file.file_size > options.maxBytes) {
        throw new Error(`Telegram image ${imageNumber} exceeds the configured size limit`);
      }

      const response = await fetch(telegramDownloadUrl(options.telegramBotToken, file.file_path));
      if (!response.ok) {
        throw new Error(`Could not download Telegram image ${imageNumber}: HTTP ${response.status}`);
      }
      const content = new Uint8Array(await response.arrayBuffer());
      if (content.byteLength > options.maxBytes) {
        throw new Error(`Telegram image ${imageNumber} exceeds the configured size limit`);
      }

      const url = await options.github.uploadImage(
        options.repository,
        releaseAssetName(image, file.file_path),
        content,
        image.mimeType || response.headers.get("content-type") || "application/octet-stream",
      );
      uploaded.push({
        telegramMessageId: message.telegramMessageId,
        url,
        alt: image.fileName || `Telegram image ${imageNumber} of ${total}`,
      });
    }
  }

  return uploaded;
}
