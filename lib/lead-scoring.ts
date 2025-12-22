// Block 8850 — Lead Score Engine v1
// Helper function to trigger lead scoring updates

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { applyScoreEvent } from "./lead-scoring/engine";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Trigger lead score update
 * This is a fire-and-forget operation that won't block the main request
 */
export async function updateLeadScore(
  leadId: string,
  eventType: "open" | "click" | "reply" | "reply_job_keywords" | "reply_booking_intent" | "reply_phone" | "appointment_booked" | "no_response_7" | "no_response_15" | "bounce" | "unsubscribe",
  workspaceId?: string
): Promise<void> {
  if (!leadId || !eventType) {
    return;
  }

  // Fire and forget - get owner_id and apply score
  (async () => {
    try {
      // Get lead to find owner_id
      const { data: lead } = await supabase
        .from("leads")
        .select("workspace_id")
        .eq("id", leadId)
        .maybeSingle();

      if (!lead) {
        console.error("Lead not found for scoring:", leadId);
        return;
      }

      // Get owner_id from workspace
      const { data: workspaceMember } = await supabase
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", lead.workspace_id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      const ownerId = workspaceMember?.user_id;
      if (!ownerId) {
        console.error("Could not find owner_id for lead:", leadId);
        return;
      }

      await applyScoreEvent(supabase, {
        lead_id: leadId,
        owner_id: ownerId,
        event_type: eventType,
      });
    } catch (err) {
      console.error("Failed to update lead score:", err);
    }
  })();
}








