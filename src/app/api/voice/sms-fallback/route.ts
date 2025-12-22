// API endpoint for SMS fallback on missed calls
// Block 467 — AI Voice Steps v1

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const bodySchema = z.object({
  call_log_id: z.string().uuid(),
  task_id: z.string().uuid().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const { call_log_id, task_id } = bodySchema.parse(json);

    // Get call log details
    const { data: callLog, error: logError } = await supabase
      .from("call_logs")
      .select(
        `
        *,
        leads:lead_id (
          id,
          phone,
          first_name,
          company,
          workspace_id
        ),
        campaign_steps:step_id (
          voice_sms_fallback_enabled,
          voice_sms_fallback_message,
          voice_sms_fallback_triggers
        )
      `
      )
      .eq("id", call_log_id)
      .single();

    if (logError || !callLog) {
      return NextResponse.json(
        { error: "Call log not found" },
        { status: 404 }
      );
    }

    // Check if SMS fallback should be sent
    const step = callLog.campaign_steps;
    const lead = callLog.leads;

    if (!step?.voice_sms_fallback_enabled) {
      return NextResponse.json(
        { error: "SMS fallback not enabled for this step" },
        { status: 400 }
      );
    }

    if (!step.voice_sms_fallback_triggers?.includes(callLog.outcome)) {
      return NextResponse.json(
        { error: `SMS fallback not triggered for outcome: ${callLog.outcome}` },
        { status: 400 }
      );
    }

    if (!lead?.phone) {
      return NextResponse.json(
        { error: "Lead does not have a phone number" },
        { status: 400 }
      );
    }

    // Replace placeholders in SMS message
    let smsMessage = step.voice_sms_fallback_message || "";
    smsMessage = smsMessage.replace(/\{\{first_name\}\}/g, lead.first_name || "");
    smsMessage = smsMessage.replace(/\{\{company\}\}/g, lead.company || "");

    // Check SMS suppression
    const { data: suppressed } = await supabase
      .from("sms_suppressions")
      .select("id")
      .eq("phone_number", lead.phone)
      .eq("workspace_id", lead.workspace_id)
      .maybeSingle();

    if (suppressed) {
      return NextResponse.json(
        { error: "Phone number is suppressed" },
        { status: 400 }
      );
    }

    // Queue SMS message
    const { data: smsQueue, error: queueError } = await supabase
      .from("send_queue")
      .insert({
        lead_id: lead.id,
        campaign_id: callLog.campaign_id,
        campaign_step_id: callLog.step_id,
        workspace_id: lead.workspace_id,
        queue_type: "sms",
        sms_body: smsMessage,
        sms_to_phone: lead.phone,
        sms_provider: "twilio",
        status: "pending",
        scheduled_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (queueError) {
      console.error("Error queueing SMS:", queueError);
      return NextResponse.json(
        { error: "Failed to queue SMS fallback" },
        { status: 500 }
      );
    }

    // Update call log to mark SMS fallback as sent
    await supabase
      .from("call_logs")
      .update({ sms_fallback_sent: true })
      .eq("id", call_log_id);

    // Update task if provided
    if (task_id) {
      await supabase
        .from("tasks")
        .update({ sms_fallback_sent: true, sms_fallback_message: smsMessage })
        .eq("id", task_id);
    }

    return NextResponse.json({
      ok: true,
      sms_queue_id: smsQueue.id,
      message: smsMessage,
    });
  } catch (err: any) {
    console.error("Error sending SMS fallback:", err);
    const msg =
      err?.issues?.[0]?.message ||
      err?.message ||
      "Failed to send SMS fallback";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}



