// Block 40850 — SmartSend Roofing "AI Proposal Engine + Dynamic Estimate Builder" v1
// API Route: GET /api/proposals/[id]/analytics
// Returns proposal analytics and tracking data

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Get analytics using the database function
    const { data: analytics, error } = await supabase.rpc("get_proposal_analytics", {
      p_proposal_id: id,
    });

    if (error) {
      console.error("Error getting analytics:", error);
      return NextResponse.json(
        { error: error.message || "Failed to get analytics" },
        { status: 500 }
      );
    }

    return NextResponse.json({ analytics });
  } catch (error: any) {
    console.error("Error in analytics route:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































