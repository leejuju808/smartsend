// Block 30519 — SmartSend Roofing "Smart Phone Call Capture + Missed Call AI Responder" v1
// API Route: Call Analytics
// Returns call statistics for dashboard

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's workspace
    const { data: workspaceMember } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (!workspaceMember) {
      return NextResponse.json({ error: "No workspace found" }, { status: 404 });
    }

    const workspaceId = workspaceMember.workspace_id;

    // Get date range from query params
    const searchParams = req.nextUrl.searchParams;
    const days = parseInt(searchParams.get("days") || "7");
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Get call statistics
    const { data: callLogs, error: callError } = await supabaseAdmin
      .from("call_logs")
      .select("*")
      .eq("workspace_id", workspaceId)
      .gte("created_at", startDate.toISOString())
      .order("created_at", { ascending: false });

    if (callError) {
      console.error("Error fetching call logs:", callError);
      return NextResponse.json({ error: callError.message }, { status: 500 });
    }

    // Calculate statistics
    const totalCalls = callLogs?.length || 0;
    const missedCalls = callLogs?.filter(c => c.event === "missed").length || 0;
    const answeredCalls = callLogs?.filter(c => c.event === "answered" || c.event === "completed").length || 0;
    const voicemails = callLogs?.filter(c => c.event === "voicemail").length || 0;

    // Get recovery rate (missed calls that became leads)
    const { data: recoveredCalls } = await supabaseAdmin
      .from("call_to_lead_map")
      .select("call_id")
      .in(
        "call_id",
        callLogs?.filter(c => c.event === "missed").map(c => c.id) || []
      );

    const recoveryRate = missedCalls > 0 
      ? ((recoveredCalls?.length || 0) / missedCalls) * 100 
      : 0;

    // Get leads created from calls
    const { data: callLeads } = await supabaseAdmin
      .from("call_to_lead_map")
      .select("lead_id")
      .in(
        "call_id",
        callLogs?.map(c => c.id) || []
      );

    const uniqueLeads = new Set(callLeads?.map(c => c.lead_id) || []).size;

    // Get emergency leads
    const { data: emergencyIntents } = await supabaseAdmin
      .from("call_intents")
      .select("call_id")
      .eq("predicted_intent", "emergency_leak")
      .in(
        "call_id",
        callLogs?.map(c => c.id) || []
      );

    const emergencyLeads = emergencyIntents?.length || 0;

    // Get storm calls (would need additional logic to detect storm conditions)
    // For now, we'll use storm_damage intent
    const { data: stormIntents } = await supabaseAdmin
      .from("call_intents")
      .select("call_id")
      .eq("predicted_intent", "storm_damage")
      .in(
        "call_id",
        callLogs?.map(c => c.id) || []
      );

    const stormCalls = stormIntents?.length || 0;

    // Get answer rate
    const answerRate = totalCalls > 0 
      ? ((answeredCalls / totalCalls) * 100) 
      : 0;

    // Get recent call logs with intent info
    const recentCalls = await Promise.all(
      (callLogs?.slice(0, 50) || []).map(async (call) => {
        const { data: intent } = await supabaseAdmin
          .from("call_intents")
          .select("predicted_intent, confidence, reply_text")
          .eq("call_id", call.id)
          .limit(1)
          .maybeSingle();

        const { data: leadMap } = await supabaseAdmin
          .from("call_to_lead_map")
          .select("lead_id")
          .eq("call_id", call.id)
          .limit(1)
          .maybeSingle();

        return {
          ...call,
          intent: intent?.predicted_intent || null,
          confidence: intent?.confidence || null,
          reply_text: intent?.reply_text || null,
          lead_id: leadMap?.lead_id || null,
        };
      })
    );

    return NextResponse.json({
      stats: {
        totalCalls,
        missedCalls,
        answeredCalls,
        voicemails,
        recoveryRate: Math.round(recoveryRate * 10) / 10,
        answerRate: Math.round(answerRate * 10) / 10,
        leadsCreated: uniqueLeads,
        emergencyLeads,
        stormCalls,
      },
      recentCalls,
    });
  } catch (error) {
    console.error("Call analytics error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}


































