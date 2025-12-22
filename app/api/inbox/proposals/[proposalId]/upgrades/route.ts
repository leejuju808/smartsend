// Block 25940 — Proposal Upgrades Management
// Handle upgrade selection and deselection

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/inbox/proposals/[proposalId]/upgrades
 * Update upgrade selection
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { proposalId: string } }
) {
  try {
    const supabase = createClient();
    const { proposalId } = params;
    const body = await req.json();

    const { upgrade_id, selected } = body;

    if (!upgrade_id || typeof selected !== "boolean") {
      return NextResponse.json(
        { error: "upgrade_id and selected are required" },
        { status: 400 }
      );
    }

    // Update upgrade selection
    const { data: upgrade, error: upgradeError } = await supabase
      .from("proposal_upgrades")
      .update({
        selected,
        selected_at: selected ? new Date().toISOString() : null,
      })
      .eq("proposal_id", proposalId)
      .eq("upgrade_id", upgrade_id)
      .select()
      .single();

    if (upgradeError) {
      console.error("Error updating upgrade:", upgradeError);
      return NextResponse.json(
        { error: "Failed to update upgrade" },
        { status: 500 }
      );
    }

    // Update proposal upgrade_options JSONB
    const { data: proposal } = await supabase
      .from("proposals")
      .select("upgrade_options")
      .eq("id", proposalId)
      .single();

    if (proposal && proposal.upgrade_options) {
      const upgrades = Array.isArray(proposal.upgrade_options)
        ? proposal.upgrade_options
        : [];
      const updatedUpgrades = upgrades.map((u: any) =>
        u.id === upgrade_id ? { ...u, selected } : u
      );

      await supabase
        .from("proposals")
        .update({ upgrade_options: updatedUpgrades })
        .eq("id", proposalId);
    }

    // Track analytics
    await supabase.from("proposal_analytics").insert({
      proposal_id: proposalId,
      action_type: selected ? "upgrade_add" : "upgrade_remove",
      upgrade_id,
    });

    return NextResponse.json({ upgrade, success: true });
  } catch (error) {
    console.error("Error updating upgrade:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/inbox/proposals/[proposalId]/upgrades
 * Get all upgrades for a proposal
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { proposalId: string } }
) {
  try {
    const supabase = createClient();
    const { proposalId } = params;

    const { data: upgrades, error: upgradesError } = await supabase
      .from("proposal_upgrades")
      .select("*")
      .eq("proposal_id", proposalId)
      .order("created_at", { ascending: true });

    if (upgradesError) {
      return NextResponse.json(
        { error: "Failed to fetch upgrades" },
        { status: 500 }
      );
    }

    return NextResponse.json({ upgrades: upgrades || [], success: true });
  } catch (error) {
    console.error("Error fetching upgrades:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}




































