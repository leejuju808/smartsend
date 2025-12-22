import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/cron/contacts-auto-merge
 * Hourly cron job to automatically merge duplicate contacts
 * Called by Vercel cron or external scheduler
 */
export async function POST(req: NextRequest) {
  try {
    // Verify cron secret if provided
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createClient();
    
    // Call the auto-merge function for all workspaces
    const { data: results, error } = await supabase.rpc(
      "auto_merge_contacts_hourly",
      { p_workspace_id: null } // null = process all workspaces
    );

    if (error) {
      console.error("Error in hourly auto-merge:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    // Calculate total merged count
    const totalMerged = (results || []).reduce((sum: number, r: any) => sum + (r.merged_count || 0), 0);

    return NextResponse.json({
      success: true,
      totalMerged,
      workspaceResults: results || [],
      message: `Hourly auto-merge completed: ${totalMerged} duplicate contact(s) merged`,
    });
  } catch (error: any) {
    console.error("Error in POST /api/cron/contacts-auto-merge:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/cron/contacts-auto-merge
 * Allow GET requests for manual testing or health checks
 */
export async function GET(req: NextRequest) {
  return POST(req);
}





















































