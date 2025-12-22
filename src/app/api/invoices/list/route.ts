import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

/**
 * GET /api/invoices/list
 * Lists invoices with optional filters
 * 
 * Query params: schedule_id, job_id, workspace_id
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const scheduleId = searchParams.get("schedule_id");
    const jobId = searchParams.get("job_id");
    const workspaceId = searchParams.get("workspace_id");

    const supabase = getServerSupabase();

    let query = supabase
      .from("invoices")
      .select(`
        *,
        payment_milestones (
          label,
          amount,
          status,
          due_date
        )
      `)
      .order("created_at", { ascending: false });

    if (scheduleId) {
      query = query.eq("schedule_id", scheduleId);
    }

    if (jobId) {
      query = query.eq("job_id", jobId);
    }

    if (workspaceId) {
      query = query.eq("workspace_id", workspaceId);
    }

    const { data: invoices, error } = await query;

    if (error) {
      console.error("Error fetching invoices:", error);
      return NextResponse.json(
        { error: "Failed to fetch invoices", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ invoices: invoices || [] });
  } catch (error: any) {
    console.error("Error in list invoices:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}
