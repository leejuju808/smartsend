// Block 21230 — SmartSend Roofing "Next Best Action" Brain v1
// API endpoint to get and update next best action for a thread

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/inbox/threads/[id]/next-best-action
 * Get the next best action for a thread
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient();
    const { id } = await params;

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Get thread to verify access
    const { data: thread, error: threadError } = await supabase
      .from("inbox_threads")
      .select("id, campaign_id, workspace_id")
      .eq("id", id)
      .single();

    if (threadError || !thread) {
      return NextResponse.json(
        { error: "Thread not found" },
        { status: 404 }
      );
    }

    // Get next best action from thread
    const { data: threadData, error: fetchError } = await supabase
      .from("inbox_threads")
      .select(
        `
        next_best_action,
        next_best_action_priority,
        next_best_action_details,
        next_best_action_metadata,
        next_best_action_calculated_at
      `
      )
      .eq("id", id)
      .single();

    if (fetchError) {
      return NextResponse.json(
        { error: "Failed to fetch next best action" },
        { status: 500 }
      );
    }

    // If no action calculated yet, calculate it
    if (!threadData.next_best_action) {
      const { data: calculated, error: calcError } = await supabase.rpc(
        "update_next_best_action",
        {
          p_thread_id: id,
          p_trigger_reason: "manual_request",
        }
      );

      if (calcError) {
        return NextResponse.json(
          { error: "Failed to calculate next best action", details: calcError },
          { status: 500 }
        );
      }

      return NextResponse.json({
        action: calculated.action,
        priority: calculated.priority,
        details: calculated.details,
        metadata: calculated.metadata,
        calculated: true,
      });
    }

    return NextResponse.json({
      action: threadData.next_best_action,
      priority: threadData.next_best_action_priority,
      details: threadData.next_best_action_details,
      metadata: threadData.next_best_action_metadata,
      calculated_at: threadData.next_best_action_calculated_at,
      calculated: false,
    });
  } catch (error: any) {
    console.error("Error in GET /api/inbox/threads/[id]/next-best-action:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/inbox/threads/[id]/next-best-action
 * Recalculate next best action for a thread
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient();
    const { id } = await params;

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const triggerReason = body.trigger_reason || "manual_recalculation";

    // Recalculate next best action
    const { data: result, error: calcError } = await supabase.rpc(
      "update_next_best_action",
      {
        p_thread_id: id,
        p_trigger_reason: triggerReason,
      }
    );

    if (calcError) {
      return NextResponse.json(
        { error: "Failed to calculate next best action", details: calcError },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      action: result.action,
      priority: result.priority,
      details: result.details,
      metadata: result.metadata,
    });
  } catch (error: any) {
    console.error("Error in POST /api/inbox/threads/[id]/next-best-action:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}
















































