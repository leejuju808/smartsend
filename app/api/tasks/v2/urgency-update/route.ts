// Block 16200 — SmartSend Tasks & Follow-Up Board v1
// Urgency update worker (should be called by cron)

import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabaseServer";

/**
 * POST /api/tasks/v2/urgency-update
 * Update task urgency based on storm risk, message tone, etc.
 * Should be called by cron job (hourly)
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createSupabaseServer();

    // Verify this is a cron job or service role
    const authHeader = req.headers.get("authorization");
    const cronSecret = req.headers.get("x-cron-secret");
    const isServiceRole = authHeader?.includes(process.env.SUPABASE_SERVICE_ROLE_KEY?.substring(0, 20) || "");
    const isValidCron = cronSecret === process.env.CRON_SECRET;

    if (!isServiceRole && !isValidCron) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Call the database function to update urgency
    const { data, error } = await supabase.rpc('update_task_urgency');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true, 
      message: "Task urgency updated",
      result: data 
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}





















































