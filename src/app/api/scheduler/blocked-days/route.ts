import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";

/**
 * GET /api/scheduler/blocked-days
 * Get blocked days for workspace
 */
export async function GET(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req);
    if ("error" in gate) return gate.error;

    const { workspace_id } = gate;
    const supabase = getServerSupabase();

    const searchParams = req.nextUrl.searchParams;
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");

    let query = supabase
      .from("schedule_blocked_days")
      .select("*")
      .eq("workspace_id", workspace_id)
      .order("blocked_date", { ascending: true });

    if (startDate) {
      query = query.gte("blocked_date", startDate);
    }
    if (endDate) {
      query = query.lte("blocked_date", endDate);
    }

    const { data: blockedDays, error } = await query;

    if (error) {
      console.error("Error fetching blocked days:", error);
      return NextResponse.json(
        { error: "Failed to fetch blocked days", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      blocked_days: blockedDays || [],
    });
  } catch (error: any) {
    console.error("Error in blocked-days GET endpoint:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/scheduler/blocked-days
 * Add a blocked day
 * Body: { blocked_date: YYYY-MM-DD, reason?: string }
 */
export async function POST(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req);
    if ("error" in gate) return gate.error;

    const { workspace_id } = gate;
    const supabase = getServerSupabase();

    const body = await req.json();
    const { blocked_date, reason } = body;

    if (!blocked_date) {
      return NextResponse.json(
        { error: "blocked_date is required (YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    const { data: blockedDay, error } = await supabase
      .from("schedule_blocked_days")
      .insert({
        workspace_id,
        blocked_date,
        reason: reason || null,
      })
      .select()
      .single();

    if (error) {
      // Check for duplicate
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "This date is already blocked" },
          { status: 409 }
        );
      }

      console.error("Error creating blocked day:", error);
      return NextResponse.json(
        { error: "Failed to block date", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      blocked_day: blockedDay,
    });
  } catch (error: any) {
    console.error("Error in blocked-days POST endpoint:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/scheduler/blocked-days
 * Remove a blocked day
 * Body: { blocked_date: YYYY-MM-DD }
 */
export async function DELETE(req: NextRequest) {
  try {
    const gate = await requireWorkspace(req);
    if ("error" in gate) return gate.error;

    const { workspace_id } = gate;
    const supabase = getServerSupabase();

    const body = await req.json();
    const { blocked_date } = body;

    if (!blocked_date) {
      return NextResponse.json(
        { error: "blocked_date is required (YYYY-MM-DD)" },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("schedule_blocked_days")
      .delete()
      .eq("workspace_id", workspace_id)
      .eq("blocked_date", blocked_date);

    if (error) {
      console.error("Error deleting blocked day:", error);
      return NextResponse.json(
        { error: "Failed to unblock date", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error: any) {
    console.error("Error in blocked-days DELETE endpoint:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}





















































