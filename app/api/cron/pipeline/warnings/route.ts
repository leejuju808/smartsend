// Block 16300 — SmartSend Pipeline v2 Warnings Worker
// POST /api/cron/pipeline/warnings
// Checks for pipeline issues and sets warning flags

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    
    // Check for cron secret
    const cronSecret = req.headers.get("x-cron-secret");
    if (cronSecret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let totalWarnings = 0;

    // Get all workspaces
    const { data: workspaces } = await supabase
      .from("workspaces")
      .select("id");

    for (const workspace of workspaces || []) {
      const { data: warningCount } = await supabase.rpc("check_pipeline_warnings", {
        p_workspace_id: workspace.id,
      });

      if (warningCount) {
        totalWarnings += warningCount;
      }
    }

    return NextResponse.json({
      success: true,
      warnings_set: totalWarnings,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("[Pipeline Warnings] Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















































