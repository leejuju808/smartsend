// app/api/pipelines/move-contact/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(req: Request) {
  const supabase = createClient();

  // Verify user is authenticated
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json();
  const { contactPipelineId, toStageId } = body;

  if (!contactPipelineId || !toStageId) {
    return NextResponse.json(
      { error: "contactPipelineId and toStageId are required" },
      { status: 400 }
    );
  }

  // Update the contact pipeline stage
  const { data: updated, error } = await supabase
    .from("contact_pipeline")
    .update({
      stage_id: toStageId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", contactPipelineId)
    .select(`
      id,
      contact_id,
      stage_id,
      contact:contacts(
        id,
        name,
        first_name,
        last_name,
        company,
        email,
        lead_status
      )
    `)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (!updated) {
    return NextResponse.json(
      { error: "Contact pipeline not found" },
      { status: 404 }
    );
  }

  // Log pipeline update into contact_activity
  const contactId = updated.contact_id;
  if (contactId) {
    // Get stage name for the activity log
    const { data: stage } = await supabase
      .from("pipeline_stages")
      .select("name")
      .eq("id", toStageId)
      .single();

    await supabase.from("contact_activity").insert({
      contact_id: contactId,
      activity_type: "pipeline_update",
      title: `Stage changed${stage ? ` to ${stage.name}` : ""}`,
      meta: { to_stage_id: toStageId, from_pipeline_move: true },
    });
  }

  return NextResponse.json(updated);
}



























































