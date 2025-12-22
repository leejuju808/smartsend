// ------------------------------
// types/leads_list.ts
// ------------------------------

export type LeadListItem = {
  id: string;
  email: string;
  full_name: string | null;
  company: string | null;
  status: "new" | "queued" | "sending" | "sent" | "failed" | "replied";
  attempt_count: number;
  max_attempts: number;
  created_at: string;
  reply_label: string | null;
  reply_reason: string | null;
};

export type LeadListResponse = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  rows: LeadListItem[];
};

