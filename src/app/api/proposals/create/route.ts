// Block 32711 — SmartSend Roofing "AI Proposal Builder + Dynamic Contract Generator" v1
// API Route: Create AI Proposal
// POST /api/proposals/create

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const { lead_id, job_details, workspace_id, contractor_id } = body;

    if (!lead_id || !workspace_id) {
      return NextResponse.json(
        { error: "lead_id and workspace_id are required" },
        { status: 400 }
      );
    }

    // Get workspace to verify access
    const { data: workspace } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!workspace) {
      return NextResponse.json(
        { error: "Workspace access denied" },
        { status: 403 }
      );
    }

    // Call edge function to generate proposal
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const response = await fetch(
      `${supabaseUrl}/functions/v1/create-proposal-ai`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          lead_id,
          job_details,
          workspace_id,
          contractor_id: contractor_id || user.id,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      console.error("Edge function error:", error);
      return NextResponse.json(
        { error: "Failed to generate proposal" },
        { status: 500 }
      );
    }

    const data = await response.json();

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Error in /api/proposals/create:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

































