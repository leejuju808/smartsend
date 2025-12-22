// Block 21260 — SmartSend Roofing Revenue Forecast Brain v1
// GET /api/contacts/[id]/revenue-forecast
// Returns revenue forecast data (RCV, Supplement, Upsell, Install Probability, TRUE Job Value)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/src/utils/supabase/server";
import { getCurrentWorkspaceId } from "@/src/lib/workspace";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient();
    const { id: contactId } = await params;
    
    // Get current workspace
    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    // Get thread ID from contact
    const { data: thread, error: threadError } = await supabase
      .from("inbox_threads")
      .select("id")
      .eq("contact_id", contactId)
      .eq("workspace_id", workspaceId)
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (threadError || !thread) {
      return NextResponse.json(
        { error: "Thread not found for contact" },
        { status: 404 }
      );
    }

    // Get or calculate revenue forecast
    const { data: forecast, error: forecastError } = await supabase
      .rpc("get_revenue_forecast_panel", {
        p_thread_id: thread.id,
      });

    if (forecastError) {
      console.error("Error getting revenue forecast:", forecastError);
      return NextResponse.json(
        { error: "Failed to get revenue forecast" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      forecast: forecast || null,
    });
  } catch (error: any) {
    console.error("Revenue forecast API error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient();
    const { id: contactId } = await params;
    const body = await req.json();
    const { forceRecalculate } = body;
    
    // Get current workspace
    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    // Get thread ID from contact
    const { data: thread, error: threadError } = await supabase
      .from("inbox_threads")
      .select("id")
      .eq("contact_id", contactId)
      .eq("workspace_id", workspaceId)
      .order("last_message_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (threadError || !thread) {
      return NextResponse.json(
        { error: "Thread not found for contact" },
        { status: 404 }
      );
    }

    // Calculate revenue forecast
    const { data: forecast, error: forecastError } = await supabase
      .rpc("calculate_revenue_forecast_v1", {
        p_thread_id: thread.id,
        p_force_recalculate: forceRecalculate || false,
      });

    if (forecastError) {
      console.error("Error calculating revenue forecast:", forecastError);
      return NextResponse.json(
        { error: "Failed to calculate revenue forecast" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      forecast: forecast || null,
    });
  } catch (error: any) {
    console.error("Revenue forecast calculation error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
















































