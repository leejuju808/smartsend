// Block 13500 — Contact Timeline v3
// Hook for fetching contact activity timeline

import useSWR from "swr";

export interface ContactActivity {
  id: string;
  contact_id: string;
  activity_type:
    | "email_sent"
    | "email_received"
    | "sms_sent"
    | "sms_received"
    | "call_log"
    | "file_upload"
    | "task_created"
    | "task_completed"
    | "pipeline_update"
    | "note";
  title: string | null;
  body: string | null;
  meta: Record<string, any>;
  created_at: string;
  created_by: string | null;
}

export function useContactActivity(contactId: string | null) {
  const { data, error, mutate } = useSWR<ContactActivity[]>(
    contactId ? `/api/contacts/${contactId}/activity` : null,
    (url) => fetch(url).then((r) => r.json())
  );

  return {
    activity: data || [],
    loading: !data && !error,
    error,
    refresh: mutate,
  };
}



























































