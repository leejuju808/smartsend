import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { getCurrentWorkspaceId } from "@/lib/workspace";

/**
 * POST /api/billing/payment-schedules
 * Create a payment schedule for a job
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace required" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { job_id, schedule } = body; // schedule is array of {milestone, amount, percentage, due_event}

    if (!job_id) {
      return NextResponse.json(
        { error: "Job ID is required" },
        { status: 400 }
      );
    }

    if (!schedule || !Array.isArray(schedule) || schedule.length === 0) {
      return NextResponse.json(
        { error: "Schedule array is required" },
        { status: 400 }
      );
    }

    // Create payment schedule entries
    const scheduleEntries = schedule.map((item: any) => ({
      job_id,
      workspace_id: workspaceId,
      milestone: item.milestone,
      amount: item.amount || null,
      percentage: item.percentage || null,
      due_event: item.due_event,
      paid: false,
    }));

    const { data: paymentSchedules, error } = await supabase
      .from("payment_schedules")
      .insert(scheduleEntries)
      .select();

    if (error) {
      console.error("Error creating payment schedule:", error);
      return NextResponse.json(
        { error: "Failed to create payment schedule", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ payment_schedules: paymentSchedules });
  } catch (error: any) {
    console.error("Error in POST /api/billing/payment-schedules:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/billing/payment-schedules
 * Get payment schedules
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace required" },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get("job_id");
    const paid = searchParams.get("paid");

    let query = supabase
      .from("payment_schedules")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: true });

    if (jobId) {
      query = query.eq("job_id", jobId);
    }

    if (paid !== null) {
      query = query.eq("paid", paid === "true");
    }

    const { data: paymentSchedules, error } = await query;

    if (error) {
      console.error("Error fetching payment schedules:", error);
      return NextResponse.json(
        { error: "Failed to fetch payment schedules" },
        { status: 500 }
      );
    }

    return NextResponse.json({ payment_schedules: paymentSchedules || [] });
  } catch (error: any) {
    console.error("Error in GET /api/billing/payment-schedules:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}






















