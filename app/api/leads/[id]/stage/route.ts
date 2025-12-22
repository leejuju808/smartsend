import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createClient();
  const { id } = await params;
  const leadId = id;

  const { stage_id } = await req.json();

  if (!stage_id) {
    return NextResponse.json(
      { error: "stage_id is required" },
      { status: 400 }
    );
  }

  // Get lead info before update
  const { data: lead } = await supabase
    .from("leads")
    .select("owner_id, workspace_id")
    .eq("id", leadId)
    .single();

  // Get stage name
  const { data: stage } = await supabase
    .from("pipeline_stages")
    .select("name")
    .eq("id", stage_id)
    .maybeSingle();

  // Update lead stage
  const { error: updateError } = await supabase
    .from("leads")
    .update({ stage_id })
    .eq("id", leadId);

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message },
      { status: 400 }
    );
  }

  // Create timeline event
  const { error: timelineError } = await supabase
    .from("lead_timeline_events")
    .insert({
      lead_id: leadId,
      event_type: "stage_changed",
      metadata: { stage_id },
    });

  if (timelineError) {
    // Don't fail the request if timeline event fails
    console.error("Failed to create timeline event:", timelineError);
  }

  // Notify lead owner about stage change
  if (lead?.owner_id && lead?.workspace_id) {
    try {
      await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/notify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          user_id: lead.owner_id,
          workspace_id: lead.workspace_id,
          type: "stage_change",
          title: "Lead Moved to New Stage",
          body: `Moved to ${stage?.name || "new stage"}`,
          link: `/leads/${leadId}`,
        }),
      }).catch((err) => {
        console.error("Failed to send stage change notification:", err);
      });
    } catch (err) {
      console.error("Error sending stage change notification:", err);
    }
  }

  return NextResponse.json({ ok: true });
}

