import { describe, expect, it } from "vitest";
import { formatDraft, shorten } from "../src/format.js";

describe("formatDraft", () => {
  it("quotes messages and includes optional source metadata", () => {
    const result = formatDraft([
      {
        telegramMessageId: 1,
        text: "First line\nSecond line",
        source: "Telegram: Product chat",
        originalDate: "2026-08-23T08:00:00.000Z",
        receivedAt: "2026-08-23T08:01:00.000Z",
      },
      {
        telegramMessageId: 2,
        text: "Another message",
        receivedAt: "2026-08-23T08:02:00.000Z",
      },
    ]);

    expect(result).toContain("> First line\n> Second line");
    expect(result).toContain("Telegram: Product chat");
    expect(result).toContain("---");
    expect(result).toContain("> Another message");
  });

  it("truncates oversized bodies", () => {
    const result = formatDraft(
      [{ telegramMessageId: 1, text: "x".repeat(500), receivedAt: new Date().toISOString() }],
      180,
    );
    expect(result.length).toBeLessThanOrEqual(180);
    expect(result).toContain("truncated");
  });

  it("embeds uploaded images beside their Telegram message", () => {
    const result = formatDraft(
      [{ telegramMessageId: 7, text: "A screenshot", receivedAt: new Date().toISOString() }],
      60_000,
      [
        {
          telegramMessageId: 7,
          url: "https://github.com/acme/repo/blob/main/image.png?raw=1",
          alt: "screen.png",
        },
      ],
    );

    expect(result).toContain(
      "![screen.png](https://github.com/acme/repo/blob/main/image.png?raw=1)",
    );
  });

  it("preserves complete image links when message text is truncated", () => {
    const imageUrl = "https://github.com/acme/repo/blob/main/image.png?raw=1";
    const result = formatDraft(
      [{ telegramMessageId: 7, text: "x".repeat(1_000), receivedAt: new Date().toISOString() }],
      300,
      [{ telegramMessageId: 7, url: imageUrl, alt: "image.png" }],
    );

    expect(result.length).toBeLessThanOrEqual(300);
    expect(result).toContain(`![image.png](${imageUrl})`);
    expect(result).toContain("truncated");
  });
});

describe("shorten", () => {
  it("keeps short text and ellipsizes long text", () => {
    expect(shorten("short", 10)).toBe("short");
    expect(shorten("a very long title", 8)).toBe("a very…");
  });
});
