// Block 14900 — Lead Pipeline Board v1
// POST /api/pipeline/move-contact - Move contact between stages (drag & drop)

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = createClient();
  const body = await req.json();

  const {
    contactId,
    targetStageId,
  }: { contactId: string; targetStageId: string } = body;

  if (!contactId || !targetStageId) {
    return NextResponse.json(
      { error: "Missing contactId or targetStageId" },
      { status: 400 }
    );
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: membership, error: memberError } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .eq("is_default", true)
    .single();
  if (memberError || !membership) {
    return NextResponse.json({ error: "No workspace" }, { status: 404 });
  }

  const workspaceId = membership.workspace_id;

  // Verify stage belongs to workspace
  const { data: stage, error: stageError } = await supabase
    .from("pipeline_stages")
    .select("id, key, label")
    .eq("id", targetStageId)
    .eq("workspace_id", workspaceId)
    .single();

  if (stageError || !stage) {
    return NextResponse.json({ error: "Invalid stage" }, { status: 400 });
  }

  // Update contact stage
  const updates: any = {
    pipeline_stage_id: targetStageId,
  };

  // Keep lead_status in sync for core stages
  if (stage.key === "new") updates.lead_status = "new";
  if (stage.key === "attempting") updates.lead_status = "attempting";
  if (stage.key === "warm") updates.lead_status = "warm";
  if (stage.key === "hot") updates.lead_status = "hot";
  if (stage.key === "won") updates.lead_status = "won";
  if (stage.key === "lost") updates.lead_status = "lost";

  const { data: contact, error: updateError } = await supabase
    .from("contacts")
    .update(updates)
    .eq("id", contactId)
    .eq("workspace_id", workspaceId)
    .select("id, lead_status, pipeline_stage_id")
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  // Block 16000: Log pipeline stage change to contact_activity
  const oldStageId = contact.pipeline_stage_id;
  await supabase.from("contact_activity").insert({
    workspace_id: workspaceId,
    contact_id: contactId,
    activity_type: "pipeline_stage_changed",
    title: `Moved to stage: ${stage.label}`,
    meta: {
      old_stage_id: oldStageId,
      new_stage_id: stage.id,
      stage_key: stage.key,
      stage_label: stage.label,
    },
    created_by: user.id,
  });

  return NextResponse.json(contact);
}

