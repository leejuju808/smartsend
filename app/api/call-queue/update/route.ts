// Block 21734 — SmartSend Roofing Call Queue v1
// POST /api/call-queue/update
// Update call task outcome

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { task_id: string; status: string; outcome_note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { task_id, status, outcome_note } = body;

  if (!task_id || !status) {
    return NextResponse.json(
      { error: "Missing required fields: task_id and status" },
      { status: 400 }
    );
  }

  const completedStatuses = [
    "completed",
    "no_answer",
    "voicemail_left",
    "bad_number",
    "do_not_call",
  ];

  const update: any = {
    status,
    outcome_note: outcome_note || null,
  };

  if (completedStatuses.includes(status)) {
    update.completed_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("call_tasks")
    .update(update)
    .eq("id", task_id)
    .select("lead_id, status, outcome_note")
    .single();

  if (error) {
    console.error("Call task update error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const leadId = data.lead_id;

  // Timeline log
  const addEventUrl =
    process.env.ADD_LEAD_EVENT_URL ||
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/add-lead-event`;

  try {
    await fetch(addEventUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({
        lead_id: leadId,
        event_type: "call_logged",
        event_subtype: status,
        message: `Call outcome: ${status.replace("_", " ")}`,
        metadata: { outcome_note: outcome_note || null },
      }),
    });
  } catch (eventErr) {
    console.error("Failed to log timeline event:", eventErr);
    // Don't fail the request if timeline logging fails
  }

  // Apply outcome logic (Block 21735 — Call Outcome Brain)
  try {
    const { error: outcomeError } = await supabase.rpc("apply_call_outcome", {
      p_lead_id: leadId,
      p_outcome: status,
      p_note: outcome_note || null,
    });

    if (outcomeError) {
      console.error("Failed to apply call outcome logic:", outcomeError);
      // Don't fail the request if outcome logic fails, but log it
    }
  } catch (outcomeErr) {
    console.error("Error calling apply_call_outcome:", outcomeErr);
    // Don't fail the request if outcome logic fails
  }

  return NextResponse.json({ success: true });
}

