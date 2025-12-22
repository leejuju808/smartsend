import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/cron/followup-engine
 * CRON endpoint to execute the follow-up engine
 * Runs every hour to check and execute follow-up rules
 */
export async function POST(req: NextRequest) {
  try {
    // Verify CRON secret if provided
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: "Missing Supabase configuration" },
        { status: 500 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Execute the follow-up engine
    const { data: results, error } = await supabase.rpc("execute_follow_up_engine");

    if (error) {
      console.error("Error executing follow-up engine:", error);
      return NextResponse.json(
        {
          success: false,
          error: error.message,
        },
        { status: 500 }
      );
    }

    const executedCount = results?.length || 0;

    return NextResponse.json({
      success: true,
      message: `Follow-up engine executed. ${executedCount} rules processed.`,
      executed_count: executedCount,
      results: results || [],
    });
  } catch (error: any) {
    console.error("Error in follow-up engine CRON:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/cron/followup-engine
 * Health check endpoint
 */
export async function GET(req: NextRequest) {
  return NextResponse.json({
    status: "ok",
    message: "Follow-up engine CRON endpoint is running",
  });
}





























































