// Block 15000 — SmartSend Activity Logs v1
// POST /api/activity/cleanup - Cleanup old activity logs (12 months)

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

/**
 * POST /api/activity/cleanup
 * Removes activity logs older than 12 months
 * Should be called by cron job (e.g., daily at 2 AM)
 * 
 * Query params:
 * - months: number (default: 12) - How many months to keep
 * - dry_run: boolean (default: false) - If true, only returns count without deleting
 */
export async function POST(req: NextRequest) {
  try {
    // Verify this is a cron job (check for cron secret or service role)
    const authHeader = req.headers.get("authorization");
    const cronSecret = req.headers.get("x-cron-secret");
    const expectedSecret = process.env.CRON_SECRET;

    // Allow if:
    // 1. Service role key is used (from Vercel cron)
    // 2. Cron secret matches
    // 3. Or if no secret is required in dev
    if (
      !authHeader?.includes(process.env.SUPABASE_SERVICE_ROLE_KEY || "") &&
      cronSecret !== expectedSecret &&
      process.env.NODE_ENV === "production"
    ) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const supabase = createSupabaseServer();
    const searchParams = req.nextUrl.searchParams;
    const months = parseInt(searchParams.get("months") || "12", 10);
    const dryRun = searchParams.get("dry_run") === "true";

    // Calculate cutoff date
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - months);

    if (dryRun) {
      // Just count how many would be deleted
      const { count, error } = await supabase
        .from("activity_logs")
        .select("*", { count: "exact", head: true })
        .lt("created_at", cutoffDate.toISOString());

      if (error) {
        console.error("[Activity Cleanup] Count error:", error);
        return NextResponse.json(
          { error: error.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        dry_run: true,
        cutoff_date: cutoffDate.toISOString(),
        logs_to_delete: count || 0,
        message: `Would delete ${count || 0} logs older than ${months} months`,
      });
    }

    // Call the cleanup function
    const { data, error } = await supabase.rpc("cleanup_old_activity_logs");

    if (error) {
      // Fallback: direct delete if function doesn't exist
      console.warn("[Activity Cleanup] Function not found, using direct delete");
      
      const { data: deleteData, error: deleteError } = await supabase
        .from("activity_logs")
        .delete()
        .lt("created_at", cutoffDate.toISOString())
        .select("id");

      if (deleteError) {
        console.error("[Activity Cleanup] Delete error:", deleteError);
        return NextResponse.json(
          { error: deleteError.message },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        cutoff_date: cutoffDate.toISOString(),
        deleted_count: deleteData?.length || 0,
        message: `Deleted ${deleteData?.length || 0} logs older than ${months} months`,
      });
    }

    return NextResponse.json({
      success: true,
      cutoff_date: cutoffDate.toISOString(),
      deleted_count: data || 0,
      message: `Deleted ${data || 0} logs older than ${months} months`,
    });
  } catch (error: any) {
    console.error("[Activity Cleanup] Unexpected error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}





















































