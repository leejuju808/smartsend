// Block 36110 — SmartSend Roofing "Proposal Builder + Instant Quote Engine" v1
// API Route: Public Proposal Access (by token)
// GET /api/proposals/[token]/public

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const supabase = createClient();

    // Get proposal by token (public access)
    const { data: proposal, error: proposalError } = await supabase
      .from("proposals")
      .select(`
        *,
        leads:lead_id (
          id,
          first_name,
          last_name,
          email,
          phone,
          address_line1,
          city,
          state,
          zip_code
        )
      `)
      .eq("token", token)
      .single();

    if (proposalError || !proposal) {
      return NextResponse.json(
        { error: "Proposal not found or invalid token" },
        { status: 404 }
      );
    }

    // Check if expired
    if (proposal.expires_at && new Date(proposal.expires_at) < new Date()) {
      return NextResponse.json(
        { error: "Proposal has expired" },
        { status: 410 }
      );
    }

    // Track view (create event)
    await supabase.from("proposal_events").insert({
      proposal_id: proposal.id,
      event_type: "viewed",
      metadata: {
        accessed_via: "public_token",
        ip_address: req.headers.get("x-forwarded-for") || "unknown",
      },
    });

    return NextResponse.json({
      ok: true,
      proposal,
    });
  } catch (error: any) {
    console.error("Error in /api/proposals/[token]/public:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































