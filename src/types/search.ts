// Unified Search Types - Block 9300 (v1) + Block 10800 (v2)

export type SearchResultType = "contact" | "reply" | "campaign" | "task" | "activity" | "command";

export interface BaseSearchResult {
  id: string;
  type: SearchResultType;
  score: number; // for ranking
}

export interface ContactResult extends BaseSearchResult {
  type: "contact";
  contactId: string;
  name: string | null;
  email: string;
  status?: string | null;
  city?: string | null;
  state?: string | null;
  company?: string | null;
}

export interface ReplyResult extends BaseSearchResult {
  type: "reply";
  threadId: string;
  contactId: string;
  contactName: string | null;
  contactEmail: string;
  latestIntent: string;
  snippet: string;
  campaignName?: string | null;
  lastActivityAt: string;
}

export interface CampaignResult extends BaseSearchResult {
  type: "campaign";
  campaignId: string;
  name: string;
  status: string;
}

export interface TaskResult extends BaseSearchResult {
  type: "task";
  taskId: string;
  title: string;
  dueAt: string | null;
  completed: boolean;
  contactId?: string;
  contactName?: string;
}

export interface ActivityResult extends BaseSearchResult {
  type: "activity";
  activityId: string;
  activityType: string;
  title: string;
  description?: string;
  relatedContactId?: string;
  relatedThreadId?: string;
  relatedCampaignId?: string;
  createdAt: string;
}

export interface CommandResult extends BaseSearchResult {
  type: "command";
  label: string;
  path: string; // e.g. '/settings/billing'
}

export type SearchResult = ContactResult | ReplyResult | CampaignResult | TaskResult | ActivityResult | CommandResult;

export interface SearchResponse {
  contacts: ContactResult[];
  replies: ReplyResult[];
  campaigns: CampaignResult[];
  tasks: TaskResult[];
  activity: ActivityResult[];
  commands: CommandResult[];
}

