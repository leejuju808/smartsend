import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/cron/activation-automation
 * 
 * Cron job endpoint that runs activation automation tasks:
 * - Lead Monitor (checks for no replies after 48 hours)
 * - Usage Score (calculates usage scores for all activated workspaces)
 * - 48-hour check-ins (sends check-in messages)
 * - 7-day check-ins (sends success check-ins)
 * 
 * Should be called daily (or more frequently for lead monitoring)
 * 
 * Protected by cron secret in headers
 */
export async function POST(req: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const results: any = {};

    // 1. Run Lead Monitor
    try {
      const leadMonitorRes = await fetch(`${baseUrl}/api/activation/automation/lead-monitor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      results.lead_monitor = await leadMonitorRes.json();
    } catch (error: any) {
      results.lead_monitor = { error: error.message };
    }

    // 2. Calculate Usage Scores
    try {
      const usageScoreRes = await fetch(`${baseUrl}/api/activation/automation/usage-score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      results.usage_score = await usageScoreRes.json();
    } catch (error: any) {
      results.usage_score = { error: error.message };
    }

    // 3. Send 48-hour check-ins (for campaigns launched 48 hours ago)
    try {
      // Get all workspaces with campaigns launched exactly 48 hours ago (±1 hour window)
      const leadMonitorData = results.lead_monitor?.results || [];
      const needs48HourCheckin = leadMonitorData.filter((r: any) => 
        r.hours_since_launch >= 47 && r.hours_since_launch <= 49
      );

      for (const workspace of needs48HourCheckin) {
        try {
          await fetch(`${baseUrl}/api/activation/checkin/48-hour`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ workspace_id: workspace.workspace_id }),
          });
        } catch (error: any) {
          console.error(`Failed to send 48-hour check-in for workspace ${workspace.workspace_id}:`, error);
        }
      }
      results.checkin_48_hour = { sent: needs48HourCheckin.length };
    } catch (error: any) {
      results.checkin_48_hour = { error: error.message };
    }

    // 4. Send 7-day check-ins (for campaigns launched 7 days ago)
    try {
      // Get all workspaces with campaigns launched exactly 7 days ago (±1 day window)
      const leadMonitorData = results.lead_monitor?.results || [];
      const needs7DayCheckin = leadMonitorData.filter((r: any) => {
        const daysSinceLaunch = r.hours_since_launch / 24;
        return daysSinceLaunch >= 6 && daysSinceLaunch <= 8;
      });

      for (const workspace of needs7DayCheckin) {
        try {
          await fetch(`${baseUrl}/api/activation/checkin/7-day`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ workspace_id: workspace.workspace_id }),
          });
        } catch (error: any) {
          console.error(`Failed to send 7-day check-in for workspace ${workspace.workspace_id}:`, error);
        }
      }
      results.checkin_7_day = { sent: needs7DayCheckin.length };
    } catch (error: any) {
      results.checkin_7_day = { error: error.message };
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      results,
    });
  } catch (error: any) {
    console.error("Error in activation-automation cron:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}






































