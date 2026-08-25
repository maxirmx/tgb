export interface DraftImage {
  fileId: string;
  fileUniqueId: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
}

export interface DraftMessage {
  telegramMessageId: number;
  text: string;
  images?: DraftImage[];
  source?: string;
  originalDate?: string;
  receivedAt: string;
}

export interface EmbeddedImage {
  telegramMessageId: number;
  url: string;
  alt: string;
}

export interface RepositoryRef {
  nameWithOwner: string;
}

export interface IssueRef {
  nodeId: string;
  number: number;
  title: string;
  url: string;
  repository: string;
}

export type FlowType = "issue" | "comment";
export type FlowStage = "repository" | "issue" | "title";

export interface PendingFlow {
  id: string;
  type: FlowType;
  stage: FlowStage;
  repositories?: RepositoryRef[];
  issues?: IssueRef[];
  selectedRepository?: string;
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
