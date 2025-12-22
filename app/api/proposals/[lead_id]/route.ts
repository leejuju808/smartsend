// Block 22261 — SmartSend Roofing Proposal Intelligence v1
// API Route: Get Proposals for a Lead
// Returns all proposals for a specific lead with revenue predictions

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ lead_id: string }> }
) {
  try {
    const supabase = createClient();
    const { lead_id } = await params;

    if (!lead_id) {
      return NextResponse.json(
        { error: "lead_id is required" },
        { status: 400 }
      );
    }

    // Fetch proposals with revenue calculations
    const { data: proposals, error } = await supabase
      .from("proposals_with_revenue")
      .select("*")
      .eq("lead_id", lead_id)
      .order("sent_at", { ascending: false });

    if (error) {
      console.error("Error fetching proposals:", error);
      return NextResponse.json(
        { error: "Failed to fetch proposals", details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ proposals: proposals || [] });
  } catch (error) {
    console.error("Error in get proposals API:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}








































