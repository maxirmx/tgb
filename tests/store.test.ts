// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the tgb application

import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { StateStore } from "../src/store.js";

describe("StateStore", () => {
  it("persists drafts and ignores duplicate Telegram message IDs", async () => {
    const directory = await mkdtemp(join(tmpdir(), "tg-gh-bridge-"));
    const filename = join(directory, "state.json");
    const store = new StateStore(filename);
    await store.init();

    const message = {
      telegramMessageId: 42,
      text: "hello",
      receivedAt: "2026-08-23T08:00:00.000Z",
    };
    expect(await store.addDraftMessage(123, message)).toBe(1);
    expect(await store.addDraftMessage(123, message)).toBe(1);

    const restored = new StateStore(filename);
    await restored.init();
    expect((await restored.getUser(123)).draft).toEqual([message]);
    expect(JSON.parse(await readFile(filename, "utf8")).version).toBe(1);
  });
});
