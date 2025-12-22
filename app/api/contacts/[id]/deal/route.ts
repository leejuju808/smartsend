import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { applyAutoWorkflows } from "@/lib/workflows/applyAutoWorkflows";

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const body = await req.json();

  const { estJobValue, actualJobValue, markWon } = body as {
    estJobValue?: number | null;
    actualJobValue?: number | null;
    markWon?: boolean;
  };

  // Get contact to find workspace_id
  const { data: contactData, error: contactFetchError } = await supabase
    .from("contacts")
    .select("workspace_id")
    .eq("id", params.id)
    .single();

  if (contactFetchError || !contactData) {
    return NextResponse.json(
      { error: "Contact not found" },
      { status: 404 }
    );
  }

  const updates: any = {};
  if (estJobValue !== undefined) updates.est_job_value = estJobValue;
  if (actualJobValue !== undefined) updates.actual_job_value = actualJobValue;

  if (markWon) {
    updates.lead_status = "won";
    updates.won_at = new Date().toISOString();

    // Set pipeline_stage_id to "won" stage (Block 14900)
    const { data: wonStage } = await supabase
      .from("pipeline_stages")
      .select("id")
      .eq("workspace_id", contactData.workspace_id)
      .eq("key", "won")
      .single();

    if (wonStage) {
      updates.pipeline_stage_id = wonStage.id;
    }
  }

  const { data: contact, error } = await supabase
    .from("contacts")
    .update(updates)
    .eq("id", params.id)
    .select("id, lead_status, est_job_value, actual_job_value, pipeline_stage_id")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // log to activity
  await supabase.from("contact_activity").insert({
    workspace_id: contactData.workspace_id,
    contact_id: params.id,
    activity_type: "pipeline_update",
    title: markWon ? "Job marked as WON" : "Deal value updated",
    meta: {
      est_job_value: contact.est_job_value,
      actual_job_value: contact.actual_job_value,
      pipeline_stage_id: contact.pipeline_stage_id,
    },
  });

  // Block 16100 — Apply workflow automation when marking as won
  if (markWon) {
    await applyAutoWorkflows({
      workspaceId: contactData.workspace_id,
      contactId: params.id,
      eventType: "lead_marked_won",
    });
  }

  return NextResponse.json(contact);
}

