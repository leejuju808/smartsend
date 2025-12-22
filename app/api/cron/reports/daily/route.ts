import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/src/lib/supabase/server";

/**
 * POST /api/cron/reports/daily
 * Daily cron job to generate reports and alerts for all workspaces
 * Should be called by a cron service (Vercel Cron, GitHub Actions, etc.)
 */
export async function POST(req: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = await getServerSupabase();

    // Get all active workspaces
    const { data: workspaces, error: workspacesError } = await supabase
      .from("workspaces")
      .select("id");

    if (workspacesError) {
      throw workspacesError;
    }

    const results = [];

    for (const workspace of workspaces || []) {
      try {
        // Generate daily reports
        const { error: reportError } = await supabase.rpc("generate_daily_reports", {
          p_workspace_id: workspace.id,
        });

        if (reportError) {
          console.error(`Error generating reports for workspace ${workspace.id}:`, reportError);
          results.push({
            workspace_id: workspace.id,
            reports: "failed",
            error: reportError.message,
          });
          continue;
        }

        // Generate predictive alerts
        const { error: alertError } = await supabase.rpc("generate_predictive_alerts", {
          p_workspace_id: workspace.id,
        });

        if (alertError) {
          console.error(`Error generating alerts for workspace ${workspace.id}:`, alertError);
          results.push({
            workspace_id: workspace.id,
            reports: "success",
            alerts: "failed",
            error: alertError.message,
          });
          continue;
        }

        // Generate AI insights (call API endpoint)
        try {
          const insightsResponse = await fetch(
            `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/reports/ai/insights`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${process.env.CRON_SECRET}`,
              },
              body: JSON.stringify({
                workspace_id: workspace.id,
              }),
            }
          );

          if (!insightsResponse.ok) {
            throw new Error(`Insights generation failed: ${insightsResponse.statusText}`);
          }
        } catch (insightsError: any) {
          console.error(`Error generating insights for workspace ${workspace.id}:`, insightsError);
        }

        results.push({
          workspace_id: workspace.id,
          reports: "success",
          alerts: "success",
          insights: "success",
        });
      } catch (error: any) {
        console.error(`Error processing workspace ${workspace.id}:`, error);
        results.push({
          workspace_id: workspace.id,
          error: error.message,
        });
      }
    }

    return NextResponse.json({
      success: true,
      processed: results.length,
      results,
    });
  } catch (error: any) {
    console.error("Error in daily reports cron:", error);
    return NextResponse.json(
      { error: "Failed to process daily reports", details: error.message },
      { status: 500 }
    );
  }
}

























