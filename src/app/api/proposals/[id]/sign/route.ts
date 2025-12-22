// Block 36110 — SmartSend Roofing "Proposal Builder + Instant Quote Engine" v1
// API Route: Proposal E-Signature
// POST /api/proposals/[id]/sign

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = createClient();

    const body = await req.json();
    const {
      signer_name,
      signer_email,
      signature_data,
      signature_type = "typed",
    } = body;

    if (!signer_name || !signature_data) {
      return NextResponse.json(
        { error: "signer_name and signature_data are required" },
        { status: 400 }
      );
    }

    // Verify proposal exists
    const { data: proposal, error: proposalError } = await supabase
      .from("proposals")
      .select("id, status, lead_id, job_id")
      .eq("id", id)
      .single();

    if (proposalError || !proposal) {
      return NextResponse.json(
        { error: "Proposal not found" },
        { status: 404 }
      );
    }

    // Check if already signed
    if (proposal.status === "signed") {
      return NextResponse.json(
        { error: "Proposal already signed" },
        { status: 400 }
      );
    }

    // Get client IP and user agent
    const ipAddress = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const userAgent = req.headers.get("user-agent") || "unknown";

    // Create signature record
    const { data: signature, error: signatureError } = await supabase
      .from("proposal_signatures")
      .insert({
        proposal_id: id,
        signer_name,
        signer_email: signer_email || null,
        signature_data,
        signature_type,
        ip_address: ipAddress,
        user_agent: userAgent,
      })
      .select()
      .single();

    if (signatureError) {
      console.error("Error creating signature:", signatureError);
      return NextResponse.json(
        { error: "Failed to create signature", details: signatureError.message },
        { status: 500 }
      );
    }

    // The trigger will handle updating proposal status, but we can also do it explicitly
    const { data: updatedProposal, error: updateError } = await supabase
      .from("proposals")
      .update({
        status: "signed",
        signed_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating proposal status:", updateError);
    }

    // Create signed event
    await supabase.from("proposal_events").insert({
      proposal_id: id,
      event_type: "signed",
      metadata: {
        signer_name,
        signer_email,
        signature_type,
      },
    });

    return NextResponse.json({
      ok: true,
      signature,
      proposal: updatedProposal,
    });
  } catch (error: any) {
    console.error("Error in /api/proposals/[id]/sign:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































