// Block 30519 — SmartSend Roofing "Smart Phone Call Capture + Missed Call AI Responder" v1
// API Route: Get Call History for Lead
// Returns all calls associated with a lead

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: leadId } = await params;
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify user has access to this lead
    const { data: lead } = await supabase
      .from("leads")
      .select("workspace_id")
      .eq("id", leadId)
      .maybeSingle();

    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Get all calls linked to this lead
    const { data: callMappings, error: mappingError } = await supabaseAdmin
      .from("call_to_lead_map")
      .select("call_id")
      .eq("lead_id", leadId);

    if (mappingError) {
      console.error("Error fetching call mappings:", mappingError);
      return NextResponse.json({ error: mappingError.message }, { status: 500 });
    }

    if (!callMappings || callMappings.length === 0) {
      return NextResponse.json({ calls: [] });
    }

    const callIds = callMappings.map((m) => m.call_id);

    // Get call logs
    const { data: callLogs, error: callError } = await supabaseAdmin
      .from("call_logs")
      .select("*")
      .in("id", callIds)
      .order("created_at", { ascending: false });

    if (callError) {
      console.error("Error fetching call logs:", callError);
      return NextResponse.json({ error: callError.message }, { status: 500 });
    }

    // Get intents for each call
    const callsWithDetails = await Promise.all(
      (callLogs || []).map(async (call) => {
        const { data: intent } = await supabaseAdmin
          .from("call_intents")
          .select("predicted_intent, confidence, reply_text")
          .eq("call_id", call.id)
          .limit(1)
          .maybeSingle();

        // Check if SMS was sent (we can infer this from timeline events or add a flag)
        // For now, we'll check if there's a timeline event
        const { data: timelineEvent } = await supabaseAdmin
          .from("lead_timeline_events")
          .select("id")
          .eq("lead_id", leadId)
          .eq("event_type", "call_logged")
          .contains("metadata", { call_id: call.id })
          .limit(1)
          .maybeSingle();

        const smsSent = !!timelineEvent;

        // Check if SMS was replied to (if intent exists and has reply_text)
        const smsReplied = !!(intent?.reply_text);

        // Get score boost from timeline events
        const { data: scoreEvents } = await supabaseAdmin
          .from("lead_score_events")
          .select("delta")
          .eq("lead_id", leadId)
          .contains("metadata", { source: "call_capture", call_id: call.id })
          .limit(1)
          .maybeSingle();

        return {
          id: call.id,
          phone: call.phone,
          event: call.event,
          duration: call.duration,
          voicemail_url: call.voicemail_url,
          created_at: call.created_at,
          intent: intent?.predicted_intent || null,
          confidence: intent?.confidence || null,
          reply_text: intent?.reply_text || null,
          sms_sent: smsSent,
          sms_replied: smsReplied,
          score_boost: scoreEvents?.delta || null,
        };
      })
    );

    return NextResponse.json({ calls: callsWithDetails });
  } catch (error) {
    console.error("Call history error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}


































