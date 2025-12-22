// Block 40850 — SmartSend Roofing "AI Proposal Engine + Dynamic Estimate Builder" v1
// API Route: POST /api/proposals/[id]/approve
// Handles proposal approval and e-signature

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await req.json();
    const { selected_option, signer_name, signature } = body;

    if (!selected_option || !signer_name) {
      return NextResponse.json(
        { error: "selected_option and signer_name are required" },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Update proposal
    const { data: proposal, error: proposalError } = await supabase
      .from("proposals")
      .update({
        selected_option,
        status: "approved",
      })
      .eq("id", id)
      .select()
      .single();

    if (proposalError) {
      console.error("Error updating proposal:", proposalError);
      return NextResponse.json(
        { error: proposalError.message || "Failed to update proposal" },
        { status: 500 }
      );
    }

    // Create signature record
    const { data: signatureData, error: signatureError } = await supabase
      .from("proposal_signatures")
      .insert({
        proposal_id: id,
        signer_name,
        signer_email: null, // Can be added if available
        signature_data: signature || signer_name,
        signature_type: signature ? "typed" : "typed",
        signed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (signatureError) {
      console.error("Error creating signature:", signatureError);
      // Don't fail the whole request if signature creation fails
    }

    // Track approval event
    await supabase.from("proposal_tracking_events").insert({
      proposal_id: id,
      event_type: "approved",
      metadata: { selected_option },
    });

    // Update job stage if job_id exists
    if (proposal.job_id) {
      await supabase
        .from("jobs")
        .update({ stage: "approved" })
        .eq("id", proposal.job_id);
    }

    // Update lead status if lead_id exists
    if (proposal.lead_id) {
      await supabase
        .from("leads")
        .update({ status: "won" })
        .eq("id", proposal.lead_id);
    }

    return NextResponse.json({
      ok: true,
      proposal,
      signature: signatureData,
      message: "Proposal approved successfully",
    });
  } catch (error: any) {
    console.error("Error in approve proposal route:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































