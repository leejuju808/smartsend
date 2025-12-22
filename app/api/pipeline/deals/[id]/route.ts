import { createClient } from "@/utils/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { getCurrentWorkspaceId } from "@/lib/workspace";
import { updateLeadScore } from "@/lib/lead-scoring";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createClient();
  const { id } = await params;
  const body = await req.json();

  // Get current workspace
  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  // Verify deal belongs to workspace
  const { data: deal } = await supabase
    .from("deals")
    .select("workspace_id, lead_id, stage")
    .eq("id", id)
    .single();

  if (!deal) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 });
  }

  if (deal.workspace_id !== workspaceId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Update deal
  const { data: updatedDeal, error: updateError } = await supabase
    .from("deals")
    .update(body)
    .eq("id", id)
    .select()
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  // Log activity if stage changed
  if (body.stage && body.stage !== deal.stage) {
    await supabase.from("deal_activity").insert({
      deal_id: id,
      type: "stage_change",
      body: `Deal moved to ${body.stage}`,
      metadata: {
        old_stage: deal.stage,
        new_stage: body.stage,
      },
    });

    // Block 273: Update lead score for stage change
    if (deal.lead_id) {
      updateLeadScore(deal.lead_id, "deal_stage_moved", deal.workspace_id);
      
      // If won, also trigger deal_won scoring
      if (body.stage === "closed_won") {
        updateLeadScore(deal.lead_id, "deal_won", deal.workspace_id);
      }
    }
  }

  return NextResponse.json({ deal: updatedDeal });
}


