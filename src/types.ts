export interface DraftMessage {
  telegramMessageId: number;
  text: string;
  source?: string;
  originalDate?: string;
  receivedAt: string;
}

export interface RepositoryRef {
  nameWithOwner: string;
}

export interface ProjectRef {
  id: string;
  number: number;
  title: string;
  owner: string;
}

export interface IssueRef {
  nodeId: string;
  number: number;
  title: string;
  url: string;
  repository: string;
}

export type FlowType = "issue" | "comment";
export type FlowStage = "repository" | "project" | "issue" | "title";

export interface PendingFlow {
  id: string;
  type: FlowType;
  stage: FlowStage;
  repositories?: RepositoryRef[];
  projects?: ProjectRef[];
  issues?: IssueRef[];
  selectedRepository?: string;
  selectedProject?: ProjectRef | null;
}

export interface UserState {
  draft: DraftMessage[];
  flow?: PendingFlow;
  statusMessageId?: number;
}

export interface PersistedState {
  version: 1;
  users: Record<string, UserState>;
}

export interface CreatedIssue {
  nodeId: string;
  number: number;
  title: string;
  url: string;
  repository: string;
}
