// Inbox-specific types for replies system

export type ThreadRow = {
  thread_id: string;
  last_at: string;
  unread_count: number;
  last_message_id: string;
  last_snippet: string | null;
  last_direction: "in" | "out";
  lead_id: string;
  lead_email: string | null;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  lead_status?: "new" | "queued" | "sending" | "sent" | "failed" | "replied" | string;
};

export type EmailMessage = {
  id: string;
  thread_id: string;
  lead_id: string;
  campaign_id: string | null;
  direction: "in" | "out";
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  sent_at: string;
  provider_message_id: string | null;
  error: string | null;
  is_read: boolean;
  created_at: string;
};

