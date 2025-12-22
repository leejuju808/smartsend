import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  if (!body)
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { lead_id, pipeline_stage } = body;

  if (!lead_id || !pipeline_stage) {
    return NextResponse.json(
      { error: "lead_id and pipeline_stage required" },
      { status: 400 }
    );
  }

  // Validate pipeline_stage
  const validStages = ["new", "contacted", "scheduled", "proposal", "won", "lost"];
  if (!validStages.includes(pipeline_stage)) {
    return NextResponse.json(
      { error: "Invalid pipeline_stage" },
      { status: 400 }
    );
  }

  // Get current lead state
  const { data: lead, error: fetchError } = await supabase
    .from("leads")
    .select("id, pipeline_stage, score, workspace_id, estimated_value, actual_value")
    .eq("id", lead_id)
    .eq("workspace_id", workspaceId)
    .single();

  if (fetchError || !lead) {
    console.error("Pipeline update error - lead not found:", fetchError);
    return NextResponse.json(
      { error: "Lead not found" },
      { status: 404 }
    );
  }

  const oldStage = lead.pipeline_stage || "new";

  // Prepare update object
  const updateData: any = { pipeline_stage };

  // Block 8870: When marking as won, set actual_value and closed_at
  if (pipeline_stage === "won" && oldStage !== "won") {
    // Set actual_value to coalesce(actual_value, estimated_value)
    updateData.actual_value = lead.actual_value || lead.estimated_value || null;
    updateData.closed_at = new Date().toISOString();
  }

  // Update pipeline stage (also update status field for compatibility)
  if (pipeline_stage === "won" || pipeline_stage === "lost") {
    updateData.status = pipeline_stage;
  }

  const { error: updateError } = await supabase
    .from("leads")
    .update(updateData)
    .eq("id", lead_id)
    .eq("workspace_id", workspaceId);

  if (updateError) {
    console.error("Pipeline update error:", updateError);
    return NextResponse.json(
      { error: "Failed to update stage" },
      { status: 500 }
    );
  }

  // Block 21977: Trigger win/loss reason detection when status changes to won/lost
  if ((pipeline_stage === "won" || pipeline_stage === "lost") && oldStage !== pipeline_stage) {
    try {
      const edgeBaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

      if (edgeBaseUrl && serviceRoleKey) {
        const edgeFunctionUrl = `${edgeBaseUrl}/functions/v1/detect-win-loss-reason`;
        
        // Call edge function asynchronously (don't wait for response)
        fetch(edgeFunctionUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({
            lead_id,
            status: pipeline_stage,
          }),
        }).catch((err) => {
          console.error("Failed to trigger win/loss reason detection:", err);
          // Don't fail the request if edge function call fails
        });
      }
    } catch (err) {
      console.error("Error triggering win/loss reason detection:", err);
      // Don't fail the request if edge function call fails
    }
  }

  // Auto-scoring: Update score based on stage change
  const scoreChanges: Record<string, number> = {
    contacted: 5,
    scheduled: 30,
    proposal: 15,
    won: 100,
    lost: -30,
  };

  const scoreDelta = scoreChanges[pipeline_stage];
  if (scoreDelta !== undefined && oldStage !== pipeline_stage) {
    const currentScore = lead.score || 0;
    const newScore = Math.max(0, Math.min(100, currentScore + scoreDelta));

    await supabase
      .from("leads")
      .update({ score: newScore })
      .eq("id", lead_id)
      .eq("workspace_id", workspaceId);
  }

  // Auto-task generation based on stage
  if (pipeline_stage === "scheduled" && oldStage !== "scheduled") {
    // Check if task already exists
    const { data: existingTask } = await supabase
      .from("tasks")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("lead_id", lead_id)
      .eq("title", "Confirm appointment")
      .eq("status", "open")
      .maybeSingle();

    if (!existingTask) {
      await supabase.from("tasks").insert({
        workspace_id: workspaceId,
        user_id: user.id,
        lead_id: lead_id,
        title: "Confirm appointment",
        notes: "Follow up to confirm scheduled appointment",
        status: "open",
        due_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
      });
    }
  } else if (pipeline_stage === "proposal" && oldStage !== "proposal") {
    // Check if task already exists
    const { data: existingTask } = await supabase
      .from("tasks")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("lead_id", lead_id)
      .eq("title", "Follow up on proposal in 2 days")
      .eq("status", "open")
      .maybeSingle();

    if (!existingTask) {
      await supabase.from("tasks").insert({
        workspace_id: workspaceId,
        user_id: user.id,
        lead_id: lead_id,
        title: "Follow up on proposal in 2 days",
        notes: "Follow up on sent proposal",
        status: "open",
        due_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days
      });
    }
  }

  return NextResponse.json({ success: true });
}
