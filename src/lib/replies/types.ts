export type EmailDraft = {
  toEmail: string;
  fromEmail: string;
  fromName: string;
  subject: string;
  html: string;
  text: string;
  ics?: { filename: string; content: string } | null;
};

export type InboundWebhookPayload = {
  provider?: string;
  from?: string;
  to?: string;
  subject?: string;
  text?: string;
  html?: string;
  headers?: Record<string, any>;
  [key: string]: any; // Allow for provider-specific fields
};

export type AutoReplyConfig = {
  enabled: boolean;
  calendlyUrl: string;
  fromName: string;
  fromEmail: string;
  greeting: string;
  meetingDuration: number;
  timezone: string;
};

// Replies Inbox UI Types
export type InboxRow = {
  thread_id: string;
  provider: 'gmail'|'outlook';
  lead_name: string | null;
  lead_email: string;
  subject: string | null;
  status: 'unreplied'|'replied'|'needs_review'|'archived';
  ai_flag: 'handwritten'|'ooo'|'spammy'|null;
  last_activity_at: string; // ISO
  last_snippet: string | null;
  last_inbound_label?: string | null;
  last_inbound_confidence?: number | null;
  last_inbound_reason?: string | null;
  reply_event_label?: string | null;
  reply_event_confidence?: number | null;
};

export type InboxTask = {
  task_id: string;
  thread_id: string;
  type: 'schedule' | 'question' | 'custom';
  status: 'open' | 'done' | 'dismissed';
  title: string;
  due_at: string | null;
  campaign_id: string | null;
  lead_id: string | null;
};

export type Message = {
  id: string;
  direction: 'in'|'out';
  from_email: string;
  from_name?: string | null;
  to_emails: string[];
  sent_at: string; // ISO
  body_text?: string | null;
  body_html?: string | null;
  snippet?: string | null;
  attachments?: { filename: string; size?: number; url?: string; }[];
  ai_label?: string | null;
  ai_confidence?: number | null;
  ai_reason?: string | null;
}; 