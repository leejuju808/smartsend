/**
 * Block 24140 — Advanced Scheduler v2
 * Dashboard Metrics API
 * 
 * Returns scheduler dashboard metrics for a workspace
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSchedulerDashboard, getQueueStats, getWaveStats } from "@/lib/scheduler/v2/dashboard";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const workspaceId = searchParams.get("workspace_id");

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspace_id is required" },
        { status: 400 }
      );
    }

    // Get dashboard metrics
    const dashboard = await getSchedulerDashboard(workspaceId);
    const queueStats = await getQueueStats(workspaceId);
    const waveStats = await getWaveStats(workspaceId);

    return NextResponse.json({
      ok: true,
      dashboard: {
        ...dashboard,
        queueStats,
        waveStats,
      },
    });
  } catch (error: any) {
    console.error("Error fetching scheduler dashboard:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch dashboard" },
      { status: 500 }
    );
  }
}






































