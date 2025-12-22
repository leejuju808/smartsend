import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

/**
 * POST /api/approval-queue/bulk-reject
 * Bulk reject multiple emails in the approval queue
 */
export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  
  try {
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse request body
    const body = await req.json();
    const { approval_ids, rejection_reason } = body;

    if (!Array.isArray(approval_ids) || approval_ids.length === 0) {
      return NextResponse.json({ 
        error: "approval_ids array is required" 
      }, { status: 400 });
    }

    if (!rejection_reason || rejection_reason.trim().length === 0) {
      return NextResponse.json({ 
        error: "rejection_reason is required" 
      }, { status: 400 });
    }

    // Get approval queue items
    const { data: approvalItems, error: fetchError } = await supabase
      .from("approval_queue")
      .select("id, workspace_id, campaign_id, lead_id, email_subject, submitted_by, status")
      .in("id", approval_ids)
      .eq("status", "pending");

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!approvalItems || approvalItems.length === 0) {
      return NextResponse.json({ 
        error: "No pending approval items found" 
      }, { status: 404 });
    }

    // Verify user is owner/admin for all workspaces
    const workspaceIds = [...new Set(approvalItems.map(item => item.workspace_id))];
    
    for (const workspaceId of workspaceIds) {
      const { data: member } = await supabase
        .from("workspace_members")
        .select("role")
        .eq("workspace_id", workspaceId)
        .eq("user_id", user.id)
        .single();

      if (!member || !["owner", "admin"].includes(member.role)) {
        return NextResponse.json({ 
          error: `You don't have permission to reject emails in workspace ${workspaceId}` 
        }, { status: 403 });
      }
    }

    // Bulk reject
    const { error: updateError } = await supabase
      .from("approval_queue")
      .update({
        status: "rejected",
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        rejection_reason: rejection_reason.trim()
      })
      .in("id", approvalItems.map(item => item.id));

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Update campaign_leads state to "Needs Revision"
    for (const item of approvalItems) {
      await supabase
        .from("campaign_leads")
        .update({ state: "Needs Revision" })
        .eq("campaign_id", item.campaign_id)
        .eq("lead_id", item.lead_id);
    }

    // Log activity
    for (const workspaceId of workspaceIds) {
      try {
        await supabase.from("workspace_activity").insert({
          workspace_id: workspaceId,
          type: "email",
          subtype: "bulk_rejected",
          actor_id: user.id,
          metadata: { 
            count: approvalItems.filter(item => item.workspace_id === workspaceId).length,
            rejection_reason: rejection_reason.trim()
          }
        });
      } catch (logErr) {
        console.error("Failed to log bulk rejection:", logErr);
      }
    }

    // Send notifications to submitters
    const submitterIds = [...new Set(approvalItems.map(item => item.submitted_by).filter(Boolean))];
    for (const submitterId of submitterIds) {
      if (submitterId !== user.id) {
        const itemsForSubmitter = approvalItems.filter(item => item.submitted_by === submitterId);
        try {
          await supabase.from("notifications").insert({
            workspace_id: itemsForSubmitter[0].workspace_id,
            user_id: submitterId,
            type: "email",
            title: `${itemsForSubmitter.length} Email(s) Rejected - Needs Revision`,
            body: `${itemsForSubmitter.length} of your emails were rejected. Reason: ${rejection_reason}`,
            link: `/team/approval-queue`
          });
        } catch (notifErr) {
          console.error("Failed to send notification:", notifErr);
        }
      }
    }

    return NextResponse.json({
      ok: true,
      rejected: approvalItems.length,
      message: `Successfully rejected ${approvalItems.length} email(s)`
    });

  } catch (error: any) {
    console.error("Bulk reject error:", error);
    return NextResponse.json({ 
      error: error.message || "Server error" 
    }, { status: 500 });
  }
}



