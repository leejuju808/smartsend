/**
 * Block 12600 - Automatic Suppression Triggers
 * Helper functions to automatically suppress contacts based on various triggers
 */

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Automatically suppress a contact when unsubscribe keywords are detected
 */
export async function suppressFromUnsubscribe(
  workspaceId: string,
  email: string,
  leadId?: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: suppressionId, error } = await supabase.rpc("suppress_contact", {
      p_workspace_id: workspaceId,
      p_email: email,
      p_reason: "unsubscribed",
      p_created_by: "system",
      p_created_by_user_id: null,
      p_notes: leadId ? `Auto-suppressed from reply (lead_id: ${leadId})` : "Auto-suppressed from unsubscribe reply",
    });

    if (error) {
      console.error("Error suppressing from unsubscribe:", error);
      return { success: false, error: error.message };
    }

    // Cancel any queued sends for this lead
    if (leadId) {
      await supabase
        .from("send_queue")
        .update({ status: "suppressed", error: "unsubscribed" })
        .eq("lead_id", leadId)
        .in("status", ["queued", "pending"]);
    }

    return { success: true };
  } catch (error: any) {
    console.error("Error in suppressFromUnsubscribe:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Automatically suppress a contact when a hard bounce is detected
 */
export async function suppressFromBounce(
  workspaceId: string,
  email: string,
  bounceReason?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: suppressionId, error } = await supabase.rpc("suppress_contact", {
      p_workspace_id: workspaceId,
      p_email: email,
      p_reason: "bounce",
      p_created_by: "system",
      p_created_by_user_id: null,
      p_notes: bounceReason ? `Hard bounce: ${bounceReason}` : "Hard bounce detected",
    });

    if (error) {
      console.error("Error suppressing from bounce:", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    console.error("Error in suppressFromBounce:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Automatically suppress a contact when a spam complaint is detected
 */
export async function suppressFromComplaint(
  workspaceId: string,
  email: string,
  complaintReason?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: suppressionId, error } = await supabase.rpc("suppress_contact", {
      p_workspace_id: workspaceId,
      p_email: email,
      p_reason: "complaint",
      p_created_by: "system",
      p_created_by_user_id: null,
      p_notes: complaintReason ? `Spam complaint: ${complaintReason}` : "Spam complaint detected",
    });

    if (error) {
      console.error("Error suppressing from complaint:", error);
      return { success: false, error: error.message };
    }

    // Cancel any queued sends for this email
    await supabase
      .from("send_queue")
      .update({ status: "suppressed", error: "complaint" })
      .eq("to_email", email)
      .in("status", ["queued", "pending"]);

    return { success: true };
  } catch (error: any) {
    console.error("Error in suppressFromComplaint:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Automatically suppress a contact when classified as out of scope
 */
export async function suppressFromOutOfScope(
  workspaceId: string,
  email: string,
  reason?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { data: suppressionId, error } = await supabase.rpc("suppress_contact", {
      p_workspace_id: workspaceId,
      p_email: email,
      p_reason: "out_of_scope",
      p_created_by: "system",
      p_created_by_user_id: null,
      p_notes: reason || "Classified as out of scope",
    });

    if (error) {
      console.error("Error suppressing from out of scope:", error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error: any) {
    console.error("Error in suppressFromOutOfScope:", error);
    return { success: false, error: error.message };
  }
}





















































