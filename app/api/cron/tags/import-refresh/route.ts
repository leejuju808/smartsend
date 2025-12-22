/**
 * POST /api/cron/tags/import-refresh
 * Block 13500 — Import Tag Refresh Cron Job
 * Runs periodically to apply tags based on import metadata
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

    // Execute the import tag refresh function
    const { data, error } = await supabase.rpc("refresh_import_tags");

    if (error) {
      console.error("Error executing import tag refresh:", error);
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
      message: "Import tag refresh completed",
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Error in import tag refresh CRON:", error);
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
    message: "Import tag refresh CRON endpoint is running",
  });
}





















































