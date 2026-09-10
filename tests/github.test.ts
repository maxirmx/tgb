// Copyright (C) 2026 Maxim [maxirmx] Samsonov (www.sw.consulting)
// All rights reserved.
// This file is a part of the tgb application

import { afterEach, describe, expect, it, vi } from "vitest";
import { GitHubClient } from "../src/github.js";

const client = new GitHubClient({ token: "test-token", apiVersion: "2022-11-28" });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GitHubClient.listRepositoryIssues", () => {
  it("loads open issues from the selected repository and excludes pull requests", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify([
          {
            node_id: "issue-node",
            number: 12,
            title: "Fix the bridge",
            html_url: "https://github.com/acme/bridge/issues/12",
          },
          {
            node_id: "pull-request-node",
            number: 13,
            title: "A pull request",
            html_url: "https://github.com/acme/bridge/pull/13",
            pull_request: { url: "https://api.github.com/repos/acme/bridge/pulls/13" },
          },
        ]),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(client.listRepositoryIssues("acme/bridge")).resolves.toEqual([
      {
        nodeId: "issue-node",
        number: 12,
        title: "Fix the bridge",
        url: "https://github.com/acme/bridge/issues/12",
        repository: "acme/bridge",
      },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/acme/bridge/issues?state=open&per_page=100",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer test-token" }),
      }),
    );
  });
});

describe("GitHubClient.uploadImage", () => {
  it("creates a release asset and returns its download URL", async () => {
    const imageClient = new GitHubClient({ token: "test-token", apiVersion: "2022-11-28" });
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/releases/tags/issue-images")) {
        return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
      }
      if (url.endsWith("/releases") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            id: 77,
            upload_url: "https://uploads.github.com/repos/acme/bridge/releases/77/assets{?name,label}",
          }),
          { status: 201 },
        );
      }
      if (url.includes("/releases/77/assets?per_page=")) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          name: "image.png",
          state: "uploaded",
          browser_download_url:
            "https://github.com/acme/bridge/releases/download/issue-images/image.png",
        }),
        { status: 201 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      imageClient.uploadImage("acme/bridge", "image.png", Uint8Array.from([1, 2, 3]), "image/png"),
    ).resolves.toBe("https://github.com/acme/bridge/releases/download/issue-images/image.png");

    expect(fetchMock).toHaveBeenCalledTimes(4);
    const createReleaseRequest = fetchMock.mock.calls[1]?.[1];
    expect(JSON.parse(String(createReleaseRequest?.body))).toMatchObject({
      tag_name: "issue-images",
      draft: false,
      prerelease: true,
    });
    const uploadRequest = fetchMock.mock.calls[3]?.[1];
    expect(uploadRequest?.method).toBe("POST");
    expect(uploadRequest?.headers).toMatchObject({ "Content-Type": "image/png" });
    expect(Buffer.from(uploadRequest?.body as Uint8Array).toString("base64")).toBe("AQID");
  });

  it("reuses an existing release asset", async () => {
    const imageClient = new GitHubClient({ token: "test-token", apiVersion: "2022-11-28" });
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/releases/tags/issue-images")) {
        return new Response(
          JSON.stringify({
            id: 77,
            upload_url: "https://uploads.github.com/repos/acme/bridge/releases/77/assets{?name,label}",
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify([
          {
            name: "existing.jpg",
            state: "uploaded",
            browser_download_url:
              "https://github.com/acme/bridge/releases/download/issue-images/existing.jpg",
          },
        ]),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      imageClient.uploadImage("acme/bridge", "existing.jpg", Uint8Array.from([1]), "image/jpeg"),
    ).resolves.toBe(
      "https://github.com/acme/bridge/releases/download/issue-images/existing.jpg",
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
