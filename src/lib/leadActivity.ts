/**
 * Lead activity timeline utilities
 * Provides functions for retrieving per-lead email activity data
 */

import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export interface LeadActivityEvent {
  type: string;
  url: string | null;
  occurred_at: string;
}

/**
 * Get activity timeline for a specific lead
 */
export async function getLeadActivity(leadId: string): Promise<LeadActivityEvent[]> {
  const supabase = createServerComponentClient({ cookies });
  
  const { data } = await supabase
    .from("email_events")
    .select("event_type, url, created_at")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });

  return (data ?? []).map(event => ({
    type: event.event_type,
    url: event.url || null,
    occurred_at: event.created_at,
  }));
}

