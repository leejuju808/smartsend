/**
 * POST /api/cron/tags/storm-refresh
 * Block 13500 — Storm Tag Refresh Cron Job
 * Runs periodically to apply storm tags to contacts in affected zip codes
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

    // Execute the storm tag refresh function
    const { data, error } = await supabase.rpc("refresh_storm_tags");

    if (error) {
      console.error("Error executing storm tag refresh:", error);
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
      message: "Storm tag refresh completed",
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Error in storm tag refresh CRON:", error);
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
    message: "Storm tag refresh CRON endpoint is running",
  });
}





















































