import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

/**
 * Block 26590 — SmartSend Roofing Lead Timeline AI Insights v1
 * API route to generate AI insights for a lead via edge function
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    // Verify lead exists and user has access
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("id, workspace_id")
      .eq("id", id)
      .single();

    if (leadError || !lead) {
      return NextResponse.json(
        { error: "Lead not found" },
        { status: 404 }
      );
    }

    // Call the edge function
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const response = await fetch(
      `${supabaseUrl}/functions/v1/lead_ai_insights`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({ lead_id: id }),
      }
    );

    if (!response.ok) {
      const errorData = await response.text();
      console.error("Edge function error:", errorData);
      return NextResponse.json(
        { error: "Failed to generate insights" },
        { status: response.status }
      );
    }

    const insights = await response.json();

    // Fetch the stored insights from database to return complete data
    const { data: storedInsights } = await supabase
      .from("roofing_lead_ai_insights")
      .select("*")
      .eq("lead_id", id)
      .single();

    return NextResponse.json(storedInsights || insights);
  } catch (error: any) {
    console.error("Error in POST /api/leads/[id]/ai-insights/generate:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
