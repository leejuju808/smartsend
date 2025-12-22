// Block 40850 — SmartSend Roofing "AI Proposal Engine + Dynamic Estimate Builder" v1
// API Route: POST /api/proposals/send
// Sends proposal to homeowner

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { proposal_id } = body;

    if (!proposal_id) {
      return NextResponse.json(
        { error: "proposal_id is required" },
        { status: 400 }
      );
    }

    // Call the edge function
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data, error } = await supabase.functions.invoke("send-proposal", {
      body: { proposal_id },
    });

    if (error) {
      console.error("Error calling send-proposal function:", error);
      return NextResponse.json(
        { error: error.message || "Failed to send proposal" },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Error in send proposal route:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































