// lib/pipeline/intent-to-status.ts
// Maps intent classification results to lead_status values

import { ReplyIntentLabel } from "@/lib/ai/reply-intent";

export type LeadStatus =
  | "new"
  | "attempting"
  | "warm"
  | "hot"
  | "qualified"
  | "booked"
  | "won"
  | "lost";

/**
 * Maps intent labels to lead_status values
 */
export function mapIntentToLeadStatus(
  intent: ReplyIntentLabel
): LeadStatus {
  switch (intent) {
    case "interested":
    case "meeting_booked":
      return "hot";
    case "question":
      return "warm";
    case "not_interested":
      return "lost";
    case "neutral":
      return "warm";
    case "referral":
      return "warm";
    case "ooo":
      // Out of office doesn't change status
      return "attempting";
    case "other":
    default:
      // Default to attempting if we're already in outreach
      return "attempting";
  }
}

/**
 * Updates contact lead_status based on intent classification
 */
export async function updateContactLeadStatusFromIntent(
  supabase: any,
  contactId: string,
  intent: ReplyIntentLabel
): Promise<void> {
  const leadStatus = mapIntentToLeadStatus(intent);

  // Update contact lead_status
  const { error: updateError } = await supabase
    .from("contacts")
    .update({ lead_status: leadStatus })
    .eq("id", contactId);

  if (updateError) {
    console.error("Failed to update contact lead_status:", updateError);
    return;
  }

  // Log pipeline update activity
  await supabase.from("contact_activity").insert({
    contact_id: contactId,
    activity_type: "pipeline_update",
    title: `Lead marked as ${leadStatus}`,
    meta: { from_intent: intent, lead_status: leadStatus },
  });
}



























































