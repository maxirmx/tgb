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
