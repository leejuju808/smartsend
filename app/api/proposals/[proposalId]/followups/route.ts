// Block 22262 — SmartSend Roofing Proposal Follow-Up Engine v1
// API Route: Get Follow-Ups for a Proposal

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ proposalId: string }> }
) {
  try {
    const supabase = createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { proposalId } = await params;

    if (!proposalId) {
      return NextResponse.json(
        { error: "proposalId is required" },
        { status: 400 }
      );
    }

    // Verify proposal exists and user has access
    const { data: proposal, error: proposalError } = await supabase
      .from("proposals")
      .select("id, workspace_id")
      .eq("id", proposalId)
      .single();

    if (proposalError || !proposal) {
      return NextResponse.json(
        { error: "Proposal not found" },
        { status: 404 }
      );
    }

    // Verify user has access to workspace
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .eq("workspace_id", proposal.workspace_id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Fetch follow-ups for this proposal
    const { data: followups, error: followupsError } = await supabase
      .from("proposal_followups")
      .select(
        `
        id,
        step_number,
        intent,
        send_at,
        status,
        created_at
      `
      )
      .eq("proposal_id", proposalId)
      .order("step_number", { ascending: true });

    if (followupsError) {
      console.error("Error fetching followups:", followupsError);
      return NextResponse.json(
        { error: "Failed to fetch followups", details: followupsError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ followups: followups || [] });
  } catch (error) {
    console.error("Error in get followups API:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}








































