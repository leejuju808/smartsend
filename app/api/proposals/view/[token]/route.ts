// Block 57000 — API Route: GET /api/proposals/view/[token]
// Returns proposal data for homeowner viewing

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const supabase = createClient();

    // Get proposal by public token
    const { data: proposal, error: proposalError } = await supabase
      .from("proposals")
      .select(`
        *,
        homeowner:homeowners(*),
        contractor:profiles!proposals_contractor_id_fkey(*)
      `)
      .eq("public_token", token)
      .single();

    if (proposalError || !proposal) {
      return NextResponse.json(
        { error: "Proposal not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ proposal });
  } catch (error) {
    console.error("Error in /api/proposals/view/[token]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
