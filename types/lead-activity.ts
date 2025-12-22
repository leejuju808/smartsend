// types/lead-activity.ts
export type LeadActivityEvent = {
  id: string;
  lead_id: string;
  event_type: string;
  source: string | null;
  related_table: string | null;
  related_id: string | null;
  payload: any;
  created_at: string;
};

