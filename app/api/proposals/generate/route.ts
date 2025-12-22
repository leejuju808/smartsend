// Block 40850 — SmartSend Roofing "AI Proposal Engine + Dynamic Estimate Builder" v1
// API Route: POST /api/proposals/generate
// Generates AI-powered proposal with Good/Better/Best options

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { job_id, lead_id, workspace_id, squares, pitch, material, insurance, addons } = body;

    if (!workspace_id || !squares) {
      return NextResponse.json(
        { error: "workspace_id and squares are required" },
        { status: 400 }
      );
    }

    // Call the edge function
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data, error } = await supabase.functions.invoke("generate-proposal", {
      body: {
        job_id,
        lead_id,
        workspace_id,
        squares: parseFloat(squares),
        pitch: pitch || "medium",
        material: material || "asphalt",
        insurance: insurance || false,
        addons: addons || {},
      },
    });

    if (error) {
      console.error("Error calling generate-proposal function:", error);
      return NextResponse.json(
        { error: error.message || "Failed to generate proposal" },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Error in generate proposal route:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
































