import type {
  CreatedIssue,
  IssueRef,
  ProjectRef,
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

  async listProjects(): Promise<ProjectRef[]> {
    const query = `
      query AccessibleProjects {
        viewer {
          login
          projectsV2(first: 50, orderBy: {field: UPDATED_AT, direction: DESC}) {
            nodes { id number title }
          }
          organizations(first: 50) {
            nodes {
              login
              projectsV2(first: 50, orderBy: {field: UPDATED_AT, direction: DESC}) {
                nodes { id number title }
              }
            }
          }
        }
      }
    `;

    type ProjectNode = { id: string; number: number; title: string };
    interface ProjectData {
      viewer: {
        login: string;
        projectsV2: { nodes: ProjectNode[] };
        organizations: {
          nodes: Array<{ login: string; projectsV2: { nodes: ProjectNode[] } }>;
        };
      };
    }

    const data = await this.graphql<ProjectData>(query);
    const projects: ProjectRef[] = data.viewer.projectsV2.nodes.map((project) => ({
      ...project,
      owner: data.viewer.login,
    }));

    for (const organization of data.viewer.organizations.nodes) {
      projects.push(
        ...organization.projectsV2.nodes.map((project) => ({
          ...project,
          owner: organization.login,
        })),
      );
    }

    return projects;
  }

  async listProjectIssues(projectId: string): Promise<IssueRef[]> {
    const query = `
      query ProjectIssues($projectId: ID!) {
        node(id: $projectId) {
          ... on ProjectV2 {
            items(first: 100) {
              nodes {
                content {
                  ... on Issue {
                    id
                    number
                    title
                    url
                    state
                    repository { nameWithOwner }
                  }
                }
              }
            }
          }
        }
      }
    `;

    interface ProjectIssueData {
      node: null | {
        items: {
          nodes: Array<{
            content?: {
              id: string;
              number: number;
              title: string;
              url: string;
              state: "OPEN" | "CLOSED";
              repository: { nameWithOwner: string };
            };
          }>;
        };
      };
    }

    const data = await this.graphql<ProjectIssueData>(query, { projectId });
    if (!data.node) return [];

    return data.node.items.nodes
      .map((item) => item.content)
      .filter((issue): issue is NonNullable<typeof issue> => issue?.state === "OPEN")
      .map((issue) => ({
        nodeId: issue.id,
        number: issue.number,
        title: issue.title,
        url: issue.url,
        repository: issue.repository.nameWithOwner,
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

  async addIssueToProject(projectId: string, issueNodeId: string): Promise<void> {
    const mutation = `
      mutation AddIssueToProject($projectId: ID!, $contentId: ID!) {
        addProjectV2ItemById(input: {projectId: $projectId, contentId: $contentId}) {
          item { id }
        }
      }
    `;
    await this.graphql(mutation, { projectId, contentId: issueNodeId });
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

  private async graphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const response = await this.request<{
      data?: T;
      errors?: Array<{ message: string }>;
    }>("https://api.github.com/graphql", {
      method: "POST",
      body: JSON.stringify({ query, variables }),
    });

    if (response.errors?.length) {
      throw new GitHubApiError(response.errors.map((error) => error.message).join("; "));
    }
    if (!response.data) throw new GitHubApiError("GitHub GraphQL returned no data");
    return response.data;
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
