// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the tgb application

import { describe, expect, it } from "vitest";
import type { Message } from "grammy/types";
import { toDraftMessage } from "../src/telegram-message.js";

describe("toDraftMessage images", () => {
  it("keeps the largest Telegram photo for later upload", () => {
    const message = {
      message_id: 42,
      date: 1_788_000_000,
      caption: "Look at this",
      photo: [
        { file_id: "small", file_unique_id: "same", width: 90, height: 90, file_size: 100 },
        { file_id: "large", file_unique_id: "same", width: 1280, height: 720, file_size: 500 },
      ],
    } as unknown as Message;

    expect(toDraftMessage(message)?.images).toEqual([
      {
        fileId: "large",
        fileUniqueId: "same",
        fileName: "same.jpg",
        mimeType: "image/jpeg",
        fileSize: 500,
      },
    ]);
  });

  it("keeps image documents but not other document types", () => {
    const image = {
      message_id: 43,
      date: 1_788_000_000,
      document: {
        file_id: "png-file",
        file_unique_id: "png-unique",
        file_name: "diagram.png",
        mime_type: "image/png",
        file_size: 900,
      },
    } as unknown as Message;
    const textFile = {
      message_id: 44,
      date: 1_788_000_000,
      document: {
        file_id: "text-file",
        file_unique_id: "text-unique",
        file_name: "notes.txt",
        mime_type: "text/plain",
      },
    } as unknown as Message;

    expect(toDraftMessage(image)?.images?.[0]?.fileName).toBe("diagram.png");
    expect(toDraftMessage(textFile)?.images).toBeUndefined();
  });
});
