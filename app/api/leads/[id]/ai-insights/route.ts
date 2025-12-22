import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

/**
 * Block 26590 — SmartSend Roofing Lead Timeline AI Insights v1
 * API route to fetch AI insights for a lead
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    const { data: insights, error } = await supabase
      .from("roofing_lead_ai_insights")
      .select("*")
      .eq("lead_id", id)
      .maybeSingle();

    if (error) {
      console.error("Error fetching insights:", error);
      return NextResponse.json(
        { error: "Failed to fetch insights" },
        { status: 500 }
      );
    }

    if (!insights) {
      return NextResponse.json(
        { error: "No insights found" },
        { status: 404 }
      );
    }

    return NextResponse.json(insights);
  } catch (error: any) {
    console.error("Error in GET /api/leads/[id]/ai-insights:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
