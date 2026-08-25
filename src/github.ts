import type {
  CreatedIssue,
  IssueRef,
  RepositoryRef,
} from "./types.js";

interface GitHubClientOptions {
  token: string;
  apiVersion: string;
}

interface ImageRelease {
  id: number;
  upload_url: string;
}

interface ReleaseAsset {
  name: string;
  state: string;
  browser_download_url: string;
}

const imageReleaseTag = "issue-images";

export class GitHubApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export class GitHubClient {
  private readonly imageReleases = new Map<string, Promise<ImageRelease>>();
  private readonly imageUploads = new Map<string, Promise<string>>();

  constructor(private readonly options: GitHubClientOptions) {}

  async verify(): Promise<string> {
    const user = await this.request<{ login: string }>("https://api.github.com/user");
    return user.login;
  }

  async listRepositories(): Promise<RepositoryRef[]> {
    const repositories = await this.request<
      Array<{ full_name: string; has_issues: boolean; archived: boolean }>
    >(
      "https://api.github.com/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator,organization_member",
    );

    return repositories
      .filter((repository) => repository.has_issues && !repository.archived)
      .map((repository) => ({ nameWithOwner: repository.full_name }));
  }

  async listRepositoryIssues(repository: string): Promise<IssueRef[]> {
    const endpoint = `${this.repositoryEndpoint(repository)}/issues?state=open&per_page=100`;
    const issues = await this.request<
      Array<{
        node_id: string;
        number: number;
        title: string;
        html_url: string;
        pull_request?: unknown;
      }>
    >(endpoint);

    return issues
      .filter((issue) => !issue.pull_request)
      .map((issue) => ({
        nodeId: issue.node_id,
        number: issue.number,
        title: issue.title,
        url: issue.html_url,
        repository,
      }));
  }

  async createIssue(repository: string, title: string, body: string): Promise<CreatedIssue> {
    const endpoint = `${this.repositoryEndpoint(repository)}/issues`;
    const issue = await this.request<{
      node_id: string;
      number: number;
      title: string;
      html_url: string;
    }>(endpoint, {
      method: "POST",
      body: JSON.stringify({ title, body }),
    });

    return {
      nodeId: issue.node_id,
      number: issue.number,
      title: issue.title,
      url: issue.html_url,
      repository,
    };
  }

  async createComment(repository: string, issueNumber: number, body: string): Promise<string> {
    const endpoint = `${this.repositoryEndpoint(repository)}/issues/${issueNumber}/comments`;
    const comment = await this.request<{ html_url: string }>(endpoint, {
      method: "POST",
      body: JSON.stringify({ body }),
    });
    return comment.html_url;
  }

  async uploadImage(
    repository: string,
    name: string,
    content: Uint8Array,
    contentType: string,
  ): Promise<string> {
    const key = `${repository}:${name}`;
    const activeUpload = this.imageUploads.get(key);
    if (activeUpload) return activeUpload;

    const upload = this.uploadReleaseImage(repository, name, content, contentType);
    this.imageUploads.set(key, upload);
    try {
      return await upload;
    } finally {
      this.imageUploads.delete(key);
    }
  }

  private async uploadReleaseImage(
    repository: string,
    name: string,
    content: Uint8Array,
    contentType: string,
  ): Promise<string> {
    const release = await this.getOrCreateImageRelease(repository);
    const existing = await this.findReleaseAsset(repository, release.id, name);
    if (existing) return existing.browser_download_url;

    const uploadUrl = release.upload_url.replace(/\{.*$/, "");
    try {
      const asset = await this.request<ReleaseAsset>(
        `${uploadUrl}?name=${encodeURIComponent(name)}`,
        {
          method: "POST",
          headers: { "Content-Type": contentType },
          body: Buffer.from(content),
        },
      );
      return asset.browser_download_url;
    } catch (error) {
      if (!(error instanceof GitHubApiError) || error.status !== 422) throw error;
      const concurrentAsset = await this.findReleaseAsset(repository, release.id, name);
      if (concurrentAsset) return concurrentAsset.browser_download_url;
      throw error;
    }
  }

  private async getOrCreateImageRelease(repository: string): Promise<ImageRelease> {
    const activeRelease = this.imageReleases.get(repository);
    if (activeRelease) return activeRelease;

    const release = this.loadOrCreateImageRelease(repository);
    this.imageReleases.set(repository, release);
    try {
      return await release;
    } catch (error) {
      this.imageReleases.delete(repository);
      throw error;
    }
  }

  private async loadOrCreateImageRelease(repository: string): Promise<ImageRelease> {
    const repositoryEndpoint = this.repositoryEndpoint(repository);
    const tagEndpoint = `${repositoryEndpoint}/releases/tags/${encodeURIComponent(imageReleaseTag)}`;
    try {
      return await this.request<ImageRelease>(tagEndpoint);
    } catch (error) {
      if (!(error instanceof GitHubApiError) || error.status !== 404) throw error;
    }

    try {
      return await this.request<ImageRelease>(`${repositoryEndpoint}/releases`, {
        method: "POST",
        body: JSON.stringify({
          tag_name: imageReleaseTag,
          name: "Issue images",
          body: "Images embedded by the Telegram–GitHub bridge in issues and comments.",
          draft: false,
          prerelease: true,
          generate_release_notes: false,
        }),
      });
    } catch (error) {
      if (!(error instanceof GitHubApiError) || error.status !== 422) throw error;
      return this.request<ImageRelease>(tagEndpoint);
    }
  }

  private async findReleaseAsset(
    repository: string,
    releaseId: number,
    name: string,
  ): Promise<ReleaseAsset | undefined> {
    for (let page = 1; ; page += 1) {
      const assets = await this.request<ReleaseAsset[]>(
        `${this.repositoryEndpoint(repository)}/releases/${releaseId}/assets?per_page=100&page=${page}`,
      );
      const asset = assets.find((candidate) =>
        candidate.name === name && candidate.state === "uploaded"
      );
      if (asset || assets.length < 100) return asset;
    }
  }

  private repositoryEndpoint(repository: string): string {
    const [owner, name, extra] = repository.split("/");
    if (!owner || !name || extra) {
      throw new GitHubApiError(`Invalid repository name: ${repository}`);
    }
    return `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
  }

  private async request<T>(url: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(url, {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${this.options.token}`,
        "Content-Type": "application/json",
        "User-Agent": "telegram-github-bridge",
        "X-GitHub-Api-Version": this.options.apiVersion,
        ...init.headers,
      },
    });

    const text = await response.text();
    let payload: unknown;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      payload = { message: text };
    }

    if (!response.ok) {
      const message =
        typeof payload === "object" && payload && "message" in payload
          ? String(payload.message)
          : `GitHub request failed with status ${response.status}`;
      throw new GitHubApiError(message, response.status);
    }
    return payload as T;
  }
}
