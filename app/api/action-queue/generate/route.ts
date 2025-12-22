// Block 22112 — Action Queue v2 API
// POST: Manually trigger action queue generation for a lead or workspace

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export async function POST(req: NextRequest) {
  const supabase = createClient();
  
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspaceId = await getCurrentWorkspaceId();
  if (!workspaceId) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  try {
    const body = await req.json();
    const { lead_id } = body;

    if (!lead_id) {
      return NextResponse.json(
        { error: "Missing required field: lead_id" },
        { status: 400 }
      );
    }

    // Verify user has access to this lead
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("id, workspace_id")
      .eq("id", lead_id)
      .single();

    if (leadError || !lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    if (lead.workspace_id !== workspaceId) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Invoke the generate-action-queue edge function
    const { data, error } = await supabase.functions.invoke("generate-action-queue", {
      body: {
        lead_id,
        workspace_id: workspaceId,
      },
    });

    if (error) {
      console.error("Error invoking generate-action-queue:", error);
      return NextResponse.json(
        { error: error.message || "Failed to generate action queue" },
        { status: 500 }
      );
    }

    return NextResponse.json(data);
  } catch (error: any) {
    console.error("Error in POST /api/action-queue/generate:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}









































