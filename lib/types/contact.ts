export type ContactStatus = 
  | "New" 
  | "Attempting" 
  | "Warm" 
  | "Hot" 
  | "Customer" 
  | "Not Interested";

export interface Contact {
  id: string;
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  company?: string | null;
  title?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  timezone?: string | null;
  // Enrichment fields (Block 12400)
  county?: string | null;
  homeowner_likelihood?: "high" | "medium" | "low" | "unknown" | null;
  property_type_guess?: "single-family" | "multi-family" | "commercial" | "unknown" | null;
  roof_type_guess?: "asphalt" | "tile" | "metal" | "ballast" | "flat" | "unknown" | null;
  storm_risk_level?: "hail" | "wind" | "hurricane" | "low" | null;
  enriched_at?: string | null;
  status: ContactStatus;
  owner_id?: string | null;
  estimated_job_value?: number | null;
  // Block 14400: Revenue tracking fields
  source_campaign_id?: string | null;
  est_job_value?: number | null;
  actual_job_value?: number | null;
  won_at?: string | null;
  lead_status?: string | null;
  // Block 14900: Pipeline stage
  pipeline_stage_id?: string | null;
  pipeline_stage?: {
    id: string;
    key: string;
    label: string;
  } | null;
  created_at: string;
  updated_at: string;
}

export interface ContactStats {
  emails_sent: number;
  emails_replied: number;
  last_activity_at: string | null;
  last_intent: string | null;
}

export interface ContactCampaign {
  id: string;
  name: string;
  status?: string | null;
}

export interface ContactOwner {
  id: string;
  email: string;
  full_name?: string | null;
}

export interface ContactProfile {
  contact: Contact;
  tags: string[];
  campaigns: ContactCampaign[];
  stats: ContactStats;
  owner: ContactOwner | null;
}

export type TimelineEventType = 
  // Block 14200 — Timeline v2 event types
  | "email_sent"
  | "reply_received"
  | "task_created"
  | "task_completed"
  | "status_changed"
  | "score_changed"
  | "tag_added"
  | "tag_removed"
  | "pipeline_moved"
  | "enrichment_added"
  | "suppressed"
  | "campaign_step"
  | "note"
  | "storm_event"
  // Legacy types for backward compatibility
  | "email_opened"
  | "email_replied"
  | "email_reply"
  | "intent_changed"
  | "intent_detected"
  | "status_change"
  | "tag_change"
  | "task_assigned"
  | "note_added"
  | "sequence_step_sent"
  | "auto_followup_fired"
  | "campaign_enrolled"
  | "campaign_unenrolled"
  | "contact_merged"
  | "pipeline_stage_changed"
  | "lead_status_changed"
  | "ai_opener_generated"
  | "campaign_assigned"
  | "list_imported"
  | "profile_updated"
  | "pipeline_update";

export interface ContactTimelineEvent {
  id: string;
  contact_id?: string;
  occurred_at?: string;
  createdAt?: string; // New API format
  type: TimelineEventType;
  title: string;
  body?: string | null;
  meta: Record<string, any>;
  created_by?: string | null;
  user?: {
    id: string;
    name: string;
    avatar?: string | null;
  } | null;
}

export interface ContactTimelineResponse {
  events: ContactTimelineEvent[];
  nextCursor: string | null;
}

export interface ContactNote {
  id: string;
  contact_id: string;
  workspace_id: string;
  user_id: string;
  body: string;
  created_at: string;
  updated_at: string;
  user?: {
    id: string;
    email: string;
    full_name?: string | null;
  };
}

