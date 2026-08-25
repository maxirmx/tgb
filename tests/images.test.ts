import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadDraftImages } from "../src/images.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("uploadDraftImages", () => {
  it("downloads and uploads every draft image in message order", async () => {
    const telegramApi = {
      getFile: vi.fn(async (fileId: string) => ({
        file_path: `photos/${fileId}.jpg`,
        file_size: 3,
      })),
    };
    const github = {
      uploadImage: vi.fn(
        async (
          _repository: string,
          name: string,
          content: Uint8Array,
          contentType: string,
        ) => {
          if (!content.byteLength || !contentType) throw new Error("Missing image data");
          return `https://example/${name}`;
        },
      ),
    };
    const fetchMock = vi.fn(async () =>
      new Response(Uint8Array.from([1, 2, 3]).buffer, { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await uploadDraftImages({
      telegramApi,
      telegramBotToken: "secret-token",
      github,
      repository: "acme/bridge",
      messages: [
        {
          telegramMessageId: 1,
          text: "two images",
          receivedAt: new Date().toISOString(),
          images: [
            {
              fileId: "first",
              fileUniqueId: "first-unique",
              fileName: "first.jpg",
              mimeType: "image/jpeg",
            },
            {
              fileId: "second",
              fileUniqueId: "second-unique",
              fileName: "second.jpg",
              mimeType: "image/jpeg",
            },
          ],
        },
      ],
      maxBytes: 100,
    });

    expect(telegramApi.getFile).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(github.uploadImage).toHaveBeenCalledTimes(2);
    expect(result).toEqual([
      expect.objectContaining({ telegramMessageId: 1, alt: "first.jpg" }),
      expect.objectContaining({ telegramMessageId: 1, alt: "second.jpg" }),
    ]);
    expect(github.uploadImage.mock.calls[0]?.[1]).toMatch(
      /^issue-image-[a-f0-9]{32}\.jpg$/,
    );
    expect(github.uploadImage.mock.calls[0]?.[3]).toBe("image/jpeg");
  });

  it("rejects images above the configured size before downloading them", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      uploadDraftImages({
        telegramApi: { getFile: vi.fn() },
        telegramBotToken: "secret-token",
        github: { uploadImage: vi.fn() },
        repository: "acme/bridge",
        messages: [
          {
            telegramMessageId: 1,
            text: "large image",
            receivedAt: new Date().toISOString(),
            images: [{ fileId: "large", fileUniqueId: "large", fileSize: 101 }],
          },
        ],
        maxBytes: 100,
      }),
    ).rejects.toThrow("exceeds the configured size limit");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
