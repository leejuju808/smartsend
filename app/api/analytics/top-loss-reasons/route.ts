// Block 22210 — SmartSend Roofing Loss Reason Detector v1
// API Route: Get top loss reasons for analytics

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);
    
    const workspaceId = searchParams.get("workspace_id");
    const limit = parseInt(searchParams.get("limit") || "5", 10);
    const startDate = searchParams.get("start_date");
    const endDate = searchParams.get("end_date");

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspace_id is required" },
        { status: 400 }
      );
    }

    // Call the database function
    const { data, error } = await supabase.rpc("get_top_loss_reasons", {
      p_workspace_id: workspaceId,
      p_start_date: startDate || null,
      p_end_date: endDate || null,
      p_limit: limit,
    });

    if (error) {
      console.error("Error fetching top loss reasons:", error);
      return NextResponse.json(
        { error: "Failed to fetch loss reasons" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      data: (data || []).map((item: any) => ({
        loss_reason: item.loss_reason,
        count: parseInt(item.count.toString(), 10),
        percentage: parseFloat(item.percentage.toString()),
        avg_confidence: parseFloat(item.avg_confidence?.toString() || "0"),
        total_lost_value: parseFloat(item.total_lost_value?.toString() || "0"),
      })),
    });
  } catch (error) {
    console.error("Error in top-loss-reasons route:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

