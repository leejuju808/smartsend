// Block 220000 — Get Proposal by ID
// GET /api/proposals/[id]

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createClient();
    
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { data: proposal, error } = await supabase
      .from("estimates_proposals")
      .select(`
        *,
        estimate:estimates(
          *,
          company:roofing_companies(*),
          homeowner:homeowners(*)
        )
      `)
      .eq("id", id)
      .single();

    if (error || !proposal) {
      return NextResponse.json(
        { error: "Proposal not found" },
        { status: 404 }
      );
    }

    // Verify user owns the company
    if (proposal.estimate?.company?.owner_id !== user.id) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    return NextResponse.json({
      ok: true,
      proposal,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
