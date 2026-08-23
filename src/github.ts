import type {
  CreatedIssue,
  IssueRef,
  RepositoryRef,
} from "./types.js";

interface GitHubClientOptions {
  token: string;
  apiVersion: string;
}

export class GitHubApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export class GitHubClient {
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
