// Block 16200 — Follow-Up Cycle Worker
// Processes follow-up cycles and creates tasks

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = req.headers.get("authorization");
    const cronSecret = req.nextUrl.searchParams.get("key");
    
    if (cronSecret !== process.env.CRON_SECRET && !authHeader?.includes(process.env.CRON_SECRET || "")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Call the database function to process follow-up cycles
    const { data, error } = await supabase.rpc("process_follow_up_cycle");

    if (error) {
      console.error("Error processing follow-up cycles:", error);
      return NextResponse.json(
        { error: error.message, success: false },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Follow-up cycles processed",
      processed: data || 0,
    });
  } catch (error) {
    console.error("Error in follow-up cycle worker:", error);
    return NextResponse.json(
      { error: "Internal server error", success: false },
      { status: 500 }
    );
  }
}





















































