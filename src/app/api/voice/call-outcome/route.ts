// API endpoint for logging call outcomes
// Block 467 — AI Voice Steps v1

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const bodySchema = z.object({
  task_id: z.string().uuid().optional(),
  lead_id: z.string().uuid(),
  campaign_id: z.string().uuid().optional(),
  step_id: z.string().uuid().optional(),
  outcome: z.enum([
    "connected",
    "interested",
    "no_answer",
    "voicemail",
    "not_interested",
    "wrong_number",
    "gatekeeper",
    "busy",
    "callback_requested",
    "meeting_booked",
  ]),
  duration: z.number().int().min(0).optional(),
  notes: z.string().optional(),
  sdr_id: z.string().uuid().optional(),
  voicemail_dropped: z.boolean().default(false),
  sms_fallback_sent: z.boolean().default(false),
});

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const {
      task_id,
      lead_id,
      campaign_id,
      step_id,
      outcome,
      duration,
      notes,
      sdr_id,
      voicemail_dropped,
      sms_fallback_sent,
    } = bodySchema.parse(json);

    // Get workspace_id from lead
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("workspace_id, campaign_id")
      .eq("id", lead_id)
      .single();

    if (leadError || !lead) {
      return NextResponse.json(
        { error: "Lead not found" },
        { status: 404 }
      );
    }

    const workspace_id = lead.workspace_id;
    const final_campaign_id = campaign_id || lead.campaign_id;

    // Create call log entry
    const { data: callLog, error: logError } = await supabase
      .from("call_logs")
      .insert({
        lead_id,
        workspace_id,
        campaign_id: final_campaign_id,
        step_id,
        task_id,
        outcome,
        duration,
        sdr_id,
        notes,
        voicemail_dropped,
        sms_fallback_sent,
      })
      .select()
      .single();

    if (logError) {
      console.error("Error creating call log:", logError);
      return NextResponse.json(
        { error: "Failed to log call outcome" },
        { status: 500 }
      );
    }

    // Update task if task_id provided
    if (task_id) {
      await supabase
        .from("tasks")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          call_outcome: outcome,
          call_duration_seconds: duration,
          notes: notes,
          voicemail_dropped: voicemail_dropped,
          sms_fallback_sent: sms_fallback_sent,
        })
        .eq("id", task_id);
    }

    // Check if SMS fallback should be sent
    let smsFallbackNeeded = false;
    if (sms_fallback_sent === false && task_id) {
      // Get step configuration to check SMS fallback settings
      if (step_id) {
        const { data: step } = await supabase
          .from("campaign_steps")
          .select("voice_sms_fallback_enabled, voice_sms_fallback_triggers, voice_sms_fallback_message")
          .eq("id", step_id)
          .single();

        if (
          step?.voice_sms_fallback_enabled &&
          step.voice_sms_fallback_triggers?.includes(outcome)
        ) {
          smsFallbackNeeded = true;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      call_log_id: callLog.id,
      sms_fallback_needed: smsFallbackNeeded,
    });
  } catch (err: any) {
    console.error("Error logging call outcome:", err);
    const msg =
      err?.issues?.[0]?.message ||
      err?.message ||
      "Failed to log call outcome";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}



