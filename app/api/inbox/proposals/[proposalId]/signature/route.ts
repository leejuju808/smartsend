// Block 25940 — Proposal Signature & Approval
// Handle digital signatures and approvals

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/inbox/proposals/[proposalId]/signature
 * Create or update proposal signature
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { proposalId: string } }
) {
  try {
    const supabase = createClient();
    const { proposalId } = params;
    const body = await req.json();

    const {
      signature_data_url,
      signed_by_name,
      signed_by_email,
      selected_tier,
      selected_upgrades,
      final_price,
      deposit_amount,
      deposit_percent,
      ip_address,
      user_agent,
    } = body;

    if (!signature_data_url || !signed_by_name) {
      return NextResponse.json(
        { error: "signature_data_url and signed_by_name are required" },
        { status: 400 }
      );
    }

    // Get proposal
    const { data: proposal, error: proposalError } = await supabase
      .from("proposals")
      .select("contact_id, signature_data")
      .eq("id", proposalId)
      .single();

    if (proposalError || !proposal) {
      return NextResponse.json(
        { error: "Proposal not found" },
        { status: 404 }
      );
    }

    // Create or update signature
    const signatureData = {
      proposal_id: proposalId,
      contact_id: proposal.contact_id,
      signature_data_url,
      signed_by_name,
      signed_by_email,
      selected_tier,
      selected_upgrades: selected_upgrades || [],
      final_price,
      deposit_amount,
      deposit_percent,
      status: "signed",
      signed_at: new Date().toISOString(),
      ip_address,
      user_agent,
    };

    // Check if signature already exists
    const { data: existingSignature } = await supabase
      .from("proposal_signatures")
      .select("id")
      .eq("proposal_id", proposalId)
      .maybeSingle();

    let signature;
    if (existingSignature) {
      const { data: updated, error: updateError } = await supabase
        .from("proposal_signatures")
        .update(signatureData)
        .eq("id", existingSignature.id)
        .select()
        .single();

      if (updateError) {
        throw updateError;
      }
      signature = updated;
    } else {
      const { data: created, error: createError } = await supabase
        .from("proposal_signatures")
        .insert(signatureData)
        .select()
        .single();

      if (createError) {
        throw createError;
      }
      signature = created;
    }

    // Update proposal signature_data and status
    await supabase
      .from("proposals")
      .update({
        signature_data: {
          signed: true,
          signed_at: signature.signed_at,
          signed_by: signed_by_name,
          selected_tier,
          selected_upgrades: selected_upgrades || [],
          final_price,
          deposit_amount,
          deposit_paid: false,
        },
        status: "approved",
        approved_at: new Date().toISOString(),
      })
      .eq("id", proposalId);

    // Track analytics
    await supabase.from("proposal_analytics").insert({
      proposal_id: proposalId,
      action_type: "signature_complete",
      action_metadata: {
        selected_tier,
        selected_upgrades,
        final_price,
      },
    });

    return NextResponse.json({ signature, success: true });
  } catch (error) {
    console.error("Error creating signature:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/inbox/proposals/[proposalId]/signature
 * Get proposal signature
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { proposalId: string } }
) {
  try {
    const supabase = createClient();
    const { proposalId } = params;

    const { data: signature, error: signatureError } = await supabase
      .from("proposal_signatures")
      .select("*")
      .eq("proposal_id", proposalId)
      .maybeSingle();

    if (signatureError) {
      return NextResponse.json(
        { error: "Failed to fetch signature" },
        { status: 500 }
      );
    }

    return NextResponse.json({ signature, success: true });
  } catch (error) {
    console.error("Error fetching signature:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}




































