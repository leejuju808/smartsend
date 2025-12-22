// Block 36110 — SmartSend Roofing "Proposal Builder + Instant Quote Engine" v1
// API Route: List Proposals
// GET /api/proposals/list

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const status = searchParams.get("status");

    // Get user's workspace
    const { data: workspaceMember } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (!workspaceMember) {
      return NextResponse.json(
        { error: "No workspace found" },
        { status: 400 }
      );
    }

    // Build query
    let query = supabase
      .from("proposals")
      .select(`
        *,
        leads:lead_id (
          id,
          first_name,
          last_name,
          email,
          phone
        )
      `)
      .eq("workspace_id", workspaceMember.workspace_id)
      .order("created_at", { ascending: false });

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    const { data: proposals, error: proposalsError } = await query;

    if (proposalsError) {
      console.error("Error fetching proposals:", proposalsError);
      return NextResponse.json(
        { error: "Failed to fetch proposals", details: proposalsError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      proposals: proposals || [],
    });
  } catch (error: any) {
    console.error("Error in /api/proposals/list:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
