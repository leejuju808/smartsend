// Block 9200 — Reply Inbox Types

export type ReplyIntent = "hot" | "warm" | "follow_up" | "not_interested" | "unclassified";

export type ReplyStatus = "open" | "snoozed" | "closed" | "archived";

export type ReplyThreadSummary = {
  id: string;
  contactId: string | null;
  contactName: string | null;
  contactEmail: string;
  latestIntent: ReplyIntent;
  latestSnippet: string | null;
  latestAt: string; // ISO timestamp
  campaignId: string | null;
  campaignName: string | null;
  status: ReplyStatus;
  snoozedUntil: string | null; // Block 11900: ISO timestamp when thread should resurface
  unread: boolean;
  assignedTo: string | null;
  assignedToName: string | null;
  subject: string | null;
};

export type ReplyMessage = {
  id: string;
  direction: "inbound" | "outbound";
  from: string;
  to: string;
  subject: string | null;
  body: string | null;
  snippet: string | null;
  sentAt: string;
  createdAt: string;
  aiLabel: string | null;
};

export type MessageIntent = {
  messageId: string;
  intent: ReplyIntent;
  confidence: number | null;
  raw: any;
  createdAt: string;
};

export type ReplyThreadDetail = {
  thread: ReplyThreadSummary;
  messages: ReplyMessage[];
  intents: MessageIntent[];
};

export type LeadStatus = "New" | "Attempting" | "Warm" | "Hot" | "Customer" | "Not Interested";

export type ActivityFilter = "24h" | "72h" | "7d" | "no_reply_x" | null;

export type ReplyInboxFilters = {
  intent?: ReplyIntent | ReplyIntent[] | "all";
  status?: ReplyStatus | "all";
  campaignId?: string; // single campaign (backward compat)
  campaignIds?: string[]; // multiple campaigns (Block 11400)
  tags?: string[]; // multi-select tags (Block 11400)
  leadStatus?: LeadStatus | "all"; // contact status (Block 11400)
  q?: string; // search term
  scope?: "mine" | "all"; // deprecated, use assignee instead
  assignee?: "all" | "unassigned" | "me" | "others" | string; // user ID for specific user
  activity?: ActivityFilter; // activity time filter (Block 11400)
  daysWithoutReply?: number | null; // for no_reply_x activity filter (Block 11400)
  dateRange?: "today" | "7days" | "30days" | "all"; // deprecated, use activity instead
};

export type ReplyThreadNote = {
  id: string;
  body: string;
  createdAt: string;
  authorId: string;
  authorName: string;
  authorAvatar: string | null;
};

export type ReplyThreadDetail = {
  thread: ReplyThreadSummary;
  messages: ReplyMessage[];
  intents: MessageIntent[];
  notes?: ReplyThreadNote[];
};

export type ReplyInboxResponse = {
  threads: ReplyThreadSummary[];
  pagination: {
    cursor: string | null;
    limit: number;
    hasMore: boolean;
  };
};

