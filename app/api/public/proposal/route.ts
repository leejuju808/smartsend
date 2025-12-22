// Block 22264 — SmartSend Roofing Proposal PDF Intelligence v1
// API Route: Get Public Proposal by Token
// Public endpoint (no auth required) to fetch proposal data for viewing

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
// Use service role key to bypass RLS for public proposal access
// Security is handled by requiring a valid token
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json(
        { error: "token parameter is required" },
        { status: 400 }
      );
    }

    if (!supabaseServiceKey) {
      console.error("SUPABASE_SERVICE_ROLE_KEY not configured");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    // Use service role client to access proposal data (token provides security)
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    // Look up proposal by token
    const { data: link, error: linkError } = await supabase
      .from("proposal_public_links")
      .select(
        `
        proposal_id,
        proposals (
          id,
          lead_id,
          workspace_id,
          amount,
          proposal_url,
          pdf_url,
          proposal_data,
          proposal_text,
          status,
          created_at
        )
      `
      )
      .eq("token", token)
      .single();

    if (linkError || !link || !link.proposals) {
      return NextResponse.json(
        { error: "Proposal not found" },
        { status: 404 }
      );
    }

    const proposal = link.proposals;

    // Return proposal data (public info only)
    return NextResponse.json({
      proposal: {
        id: proposal.id,
        amount: proposal.amount,
        proposal_url: proposal.proposal_url,
        pdf_url: proposal.pdf_url,
        proposal_data: proposal.proposal_data,
        proposal_text: proposal.proposal_text,
        created_at: proposal.created_at,
      },
      token,
    });
  } catch (error) {
    console.error("Error fetching public proposal:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

