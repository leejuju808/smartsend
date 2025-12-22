import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

/**
 * POST /api/approval-queue/[id]/approve
 * Approve an email in the approval queue
 * Moves approved email to send_queue
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createRouteHandlerClient({ cookies });
  
  try {
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get approval queue item
    const { data: approvalItem, error: fetchError } = await supabase
      .from("approval_queue")
      .select("*")
      .eq("id", params.id)
      .single();

    if (fetchError || !approvalItem) {
      return NextResponse.json({ error: "Approval item not found" }, { status: 404 });
    }

    if (approvalItem.status !== "pending") {
      return NextResponse.json({ 
        error: `Email already ${approvalItem.status}` 
      }, { status: 400 });
    }

    // Verify user is owner/admin of workspace
    const { data: member } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", approvalItem.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!member || !["owner", "admin"].includes(member.role)) {
      return NextResponse.json({ 
        error: "Only workspace owners and admins can approve emails" 
      }, { status: 403 });
    }

    // Update approval queue status
    const { error: updateError } = await supabase
      .from("approval_queue")
      .update({
        status: "approved",
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString()
      })
      .eq("id", params.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Move to send_queue using database function
    const { data: sendQueueId, error: moveError } = await supabase.rpc(
      "move_approved_to_send_queue",
      { p_approval_id: params.id }
    );

    if (moveError) {
      // Rollback approval status if move fails
      await supabase
        .from("approval_queue")
        .update({ status: "pending", reviewed_by: null, reviewed_at: null })
        .eq("id", params.id);
      
      return NextResponse.json({ 
        error: `Failed to move to send queue: ${moveError.message}` 
      }, { status: 500 });
    }

    // Update campaign_leads state
    await supabase
      .from("campaign_leads")
      .update({ state: "Queued" })
      .eq("campaign_id", approvalItem.campaign_id)
      .eq("lead_id", approvalItem.lead_id);

    // Log activity
    if (approvalItem.workspace_id) {
      try {
        const { data: lead } = await supabase
          .from("leads")
          .select("email, first_name, last_name")
          .eq("id", approvalItem.lead_id)
          .single();

        const { data: campaign } = await supabase
          .from("campaigns")
          .select("name, title")
          .eq("id", approvalItem.campaign_id)
          .single();

        await supabase.from("workspace_activity").insert({
          workspace_id: approvalItem.workspace_id,
          type: "email",
          subtype: "approved",
          actor_id: user.id,
          lead_id: approvalItem.lead_id,
          campaign_id: approvalItem.campaign_id,
          metadata: {
            lead_name: lead ? `${lead.first_name || ""} ${lead.last_name || ""}`.trim() : null,
            lead_email: lead?.email || null,
            campaign_name: campaign?.name || campaign?.title || null,
            subject: approvalItem.email_subject
          }
        });
      } catch (logErr) {
        console.error("Failed to log approval:", logErr);
      }
    }

    // Send notification to submitter
    if (approvalItem.submitted_by && approvalItem.submitted_by !== user.id) {
      try {
        await supabase.from("notifications").insert({
          workspace_id: approvalItem.workspace_id,
          user_id: approvalItem.submitted_by,
          type: "email",
          title: "Email Approved",
          body: `Your email to ${approvalItem.email_subject} has been approved and will be sent.`,
          link: `/team/approval-queue`
        });
      } catch (notifErr) {
        console.error("Failed to send notification:", notifErr);
      }
    }

    return NextResponse.json({
      ok: true,
      approval_id: params.id,
      send_queue_id: sendQueueId,
      message: "Email approved and moved to send queue"
    });

  } catch (error: any) {
    console.error("Approve error:", error);
    return NextResponse.json({ 
      error: error.message || "Server error" 
    }, { status: 500 });
  }
}



