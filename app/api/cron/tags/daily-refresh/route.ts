/**
 * POST /api/cron/tags/daily-refresh
 * Block 13500 — Daily Auto-Tag Refresh Cron Job
 * Runs daily to re-evaluate and refresh auto-tags for contacts
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: NextRequest) {
  try {
    // Verify CRON secret
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

    // Execute the daily tag refresh function
    const { data, error } = await supabase.rpc("refresh_auto_tags_daily");

    if (error) {
      console.error("Error executing daily tag refresh:", error);
      return NextResponse.json(
        {
          success: false,
          error: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Daily tag refresh completed",
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Error in daily tag refresh CRON:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  return NextResponse.json({
    status: "ok",
    message: "Daily tag refresh CRON endpoint is running",
  });
}





















































