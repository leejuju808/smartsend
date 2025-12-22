// Block 57000 — API Route: GET /api/proposals/[id]/upsells
// Returns available upsells for a proposal

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createClient();

    // Get proposal to get workspace_id
    const { data: proposal, error: proposalError } = await supabase
      .from("proposals")
      .select("workspace_id")
      .eq("id", id)
      .single();

    if (proposalError || !proposal) {
      return NextResponse.json(
        { error: "Proposal not found" },
        { status: 404 }
      );
    }

    // Get active upsells for workspace
    const { data: upsells, error: upsellsError } = await supabase
      .from("proposal_upsells")
      .select("*")
      .eq("workspace_id", proposal.workspace_id)
      .eq("is_active", true)
      .order("created_at", { ascending: true });

    if (upsellsError) {
      console.error("Error fetching upsells:", upsellsError);
      return NextResponse.json(
        { error: "Failed to fetch upsells" },
        { status: 500 }
      );
    }

    return NextResponse.json({ upsells: upsells || [] });
  } catch (error) {
    console.error("Error in /api/proposals/[id]/upsells:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
































