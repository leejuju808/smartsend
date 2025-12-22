// Block 37001 — Missed Call Stats API
// Returns statistics for the missed call dashboard

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getServerSupabase } from "@/lib/supabase/server";
import { getActiveWorkspaceId } from "@/lib/workspace/context";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    const supabase = getServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    const searchParams = req.nextUrl.searchParams;
    const days = parseInt(searchParams.get("days") || "30", 10);

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Get missed call stats
    const { data: missedCalls, error: callsError } = await supabaseAdmin
      .from("missed_calls")
      .select("*")
      .eq("workspace_id", workspaceId)
      .gte("call_time", startDate.toISOString())
      .order("call_time", { ascending: false });

    if (callsError) {
      console.error("Error fetching missed calls:", callsError);
      return NextResponse.json(
        { error: "Failed to fetch missed calls" },
        { status: 500 }
      );
    }

    // Calculate stats
    const totalMissed = missedCalls?.length || 0;
    const processed = missedCalls?.filter((c) => c.processed).length || 0;
    const leadsCreated = missedCalls?.filter((c) => c.created_lead_id).length || 0;
    const emergencyCalls = missedCalls?.filter((c) => c.emergency).length || 0;
    const afterHoursCalls = missedCalls?.filter((c) => c.after_hours).length || 0;

    const recoveryRate = totalMissed > 0 ? (leadsCreated / totalMissed) * 100 : 0;

    // Get recent missed calls with lead info
    const recentCalls = (missedCalls || []).slice(0, 50).map((call) => ({
      id: call.id,
      phone: call.phone,
      call_time: call.call_time,
      processed: call.processed,
      emergency: call.emergency,
      after_hours: call.after_hours,
      created_lead_id: call.created_lead_id,
      company_name: call.company_name,
    }));

    // Get lead capture conversations
    const callIds = recentCalls.map((c) => c.id);
    const { data: captures } = await supabaseAdmin
      .from("call_lead_capture")
      .select("*")
      .in("missed_call_id", callIds)
      .order("created_at", { ascending: false });

    return NextResponse.json({
      stats: {
        total_missed_calls: totalMissed,
        processed_calls: processed,
        leads_created: leadsCreated,
        emergency_calls: emergencyCalls,
        after_hours_calls: afterHoursCalls,
        recovery_rate: Math.round(recoveryRate * 100) / 100,
      },
      recent_calls: recentCalls,
      captures: captures || [],
    });
  } catch (error) {
    console.error("Error in missed calls stats:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
































