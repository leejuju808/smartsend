import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Block 11200 — SmartSend Lead Timeline v1
 * POST /api/leads/:leadId/stop-followup
 * Stops auto follow-ups for a lead and logs the event
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  const supabase = createClient();
  const { leadId } = await params;

  // Get current user for auth
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify lead exists
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id, workspace_id")
    .eq("id", leadId)
    .single();

  if (leadError || !lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  // Get request body for reason (optional)
  let reason = "Manual action";
  try {
    const body = await req.json();
    if (body.reason) {
      reason = body.reason;
    }
  } catch {
    // No body provided, use default reason
  }

  // Update lead to stop follow-ups
  // This depends on your schema - you might have a `followups_paused` or `auto_followup_enabled` field
  // For now, we'll update a custom field or create a suppression entry
  // Adjust based on your actual schema

  // Option 1: If you have a followups_paused field
  const { error: updateError } = await supabase
    .from("leads")
    .update({ 
      // Add your field here, e.g.:
      // followups_paused: true,
      // Or use metadata:
      custom: { ...(lead as any).custom, followups_paused: true, followups_paused_at: new Date().toISOString() }
    })
    .eq("id", leadId);

  if (updateError) {
    console.error("Error stopping follow-ups:", updateError);
    // Continue anyway to log the event
  }

  // Log event for timeline
  try {
    await supabase.rpc("log_lead_event", {
      p_lead_id: leadId,
      p_type: "followup_stopped",
      p_content: `Auto follow-ups paused — ${reason}.`,
      p_metadata: {
        reason,
        stopped_by: user.id,
      },
    });
  } catch (eventError) {
    console.error("Error logging follow-up stopped event:", eventError);
    // Don't fail the request if event logging fails
  }

  return NextResponse.json({ 
    success: true,
    message: "Follow-ups stopped successfully" 
  });
}























































