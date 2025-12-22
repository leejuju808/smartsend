// Block 220000 — SmartSend Roofing Estimates → Proposals → Contracts → E-Sign → Job Pipeline
// API Route: Track Proposal View
// GET /api/proposals/view?id=123

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const searchParams = req.nextUrl.searchParams;
    const token = searchParams.get("token") || searchParams.get("id");

    if (!token) {
      return NextResponse.json(
        { error: "token or id parameter is required" },
        { status: 400 }
      );
    }

    // Get proposal by public token
    const { data: proposal, error: proposalError } = await supabase
      .from("estimates_proposals")
      .select("id, status")
      .eq("public_token", token)
      .single();

    if (proposalError || !proposal) {
      return NextResponse.json(
        { error: "Proposal not found" },
        { status: 404 }
      );
    }

    // Get client IP and user agent
    const ipAddress = req.headers.get("x-forwarded-for") || 
                      req.headers.get("x-real-ip") || 
                      "unknown";
    const userAgent = req.headers.get("user-agent") || "unknown";

    // Record view
    const { error: viewError } = await supabase
      .from("proposal_views")
      .insert({
        proposal_id: proposal.id,
        ip_address: ipAddress,
        user_agent: userAgent,
      });

    if (viewError) {
      console.error("Error recording proposal view:", viewError);
    }

    // Return proposal HTML (for direct viewing)
    const { data: fullProposal, error: fullError } = await supabase
      .from("estimates_proposals")
      .select("proposal_html")
      .eq("id", proposal.id)
      .single();

    if (fullError || !fullProposal) {
      return NextResponse.json(
        { error: "Failed to load proposal" },
        { status: 500 }
      );
    }

    // Return HTML content
    return new NextResponse(fullProposal.proposal_html, {
      headers: {
        "Content-Type": "text/html",
      },
    });
  } catch (error: any) {
    console.error("Error in /api/proposals/view:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























