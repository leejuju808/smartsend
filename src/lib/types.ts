export type SequenceStep = {
  subject: string;
  body: string;
  delay_days: number;
  variables?: string[];
};

export type Sequence = {
  id: string;
  owner: string;
  title: string;
  steps: SequenceStep[];
  niche?: 'recruiting'|'smb'|'saas'|'agency';
  created_at: string;
};

export type InboxThread = {
  id: string;
  email_id: string;
  campaign_id: string;
  subject: string | null;
  from_email: string | null;
  to_email: string | null;
  last_message_at: string | null;
  replied: boolean;
  reply_type?: 'Human Reply' | 'Out of Office' | 'Bounce / Delivery Failure' | 'Automated System Message' | null;
  reply_state?: 'none' | 'suspected' | 'confirmed';
  last_ai_label?: string | null;
  last_ai_intent?: string | null;
};

// SmartSend Replies Inbox — Database types
export type MessageRow = {
  id: string;
  thread_id: string | null;
  subject: string | null;
  snippet: string | null;
  body: string | null;
  date: string | null; // ISO
  direction: "in" | "out" | null;
  is_read: boolean | null;
  lead_status: string | null;
  from_email: string | null;
  to_email: string | null;
  account_id: string | null;
};

export type Database = {
  public: {
    Tables: {
      messages: {
        Row: MessageRow;
        Insert: Partial<MessageRow> & { id?: string };
        Update: Partial<MessageRow>;
      };
    };
    Views: {};
    Functions: {};
    Enums: {};
    CompositeTypes: {};
  };
};