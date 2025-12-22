import { createClient } from "@/lib/supabase/server";

type ActivityEventType =
  | "campaign_created"
  | "campaign_launched"
  | "campaign_paused"
  | "leads_imported"
  | "reply_received"
  | "meeting_created"
  | "billing_limit_hit"
  | "template_rewritten"
  | "ai_reply_used"
  | "user_invited"
  | "user_joined"
  | "system";

export async function logActivity(args: {
  workspaceId: string;
  actorId?: string | null;
  eventType: ActivityEventType | string;
  description: string;
  metadata?: any;
  leadId?: string | null;
  campaignId?: string | null;
  sequenceId?: string | null;
}) {
  const supabase = createClient();

  await supabase.from("workspace_activity").insert({
    workspace_id: args.workspaceId,
    actor_id: args.actorId ?? null,
    event_type: args.eventType,
    description: args.description,
    metadata: args.metadata ?? null,
    lead_id: args.leadId ?? null,
    campaign_id: args.campaignId ?? null,
    sequence_id: args.sequenceId ?? null,
  });
}







