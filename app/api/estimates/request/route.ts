// Block 73000 — SmartSend Estimate Request API
// POST /api/estimates/request
// Creates a fast-track estimate request

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const workspaceId = await getCurrentWorkspaceId();

    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { lead_id, job_type, urgency, notes, photo_urls } = body;

    if (!lead_id) {
      return NextResponse.json(
        { error: "lead_id is required" },
        { status: 400 }
      );
    }

    // Verify lead exists and belongs to workspace
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("id, workspace_id, company_id")
      .eq("id", lead_id)
      .eq("workspace_id", workspaceId)
      .single();

    if (leadError || !lead) {
      return NextResponse.json(
        { error: "Lead not found" },
        { status: 404 }
      );
    }

    // Create estimate request
    const { data: estimateRequest, error: createError } = await supabase
      .from("estimate_requests")
      .insert({
        lead_id,
        workspace_id,
        company_id: lead.company_id || null,
        job_type: job_type || null,
        urgency: urgency || "Medium",
        notes: notes || null,
        photo_urls: photo_urls || [],
        created_by: user.id,
      })
      .select()
      .single();

    if (createError) {
      console.error("[Estimate Request] Create error:", createError);
      return NextResponse.json(
        { error: createError.message || "Failed to create estimate request" },
        { status: 500 }
      );
    }

    // Move lead to "Estimate Needed" stage
    const { error: moveError } = await supabase.rpc("move_lead_to_stage", {
      p_lead_id: lead_id,
      p_stage_name: "Estimate Needed",
      p_workspace_id: workspaceId,
      p_company_id: lead.company_id || null,
    });

    if (moveError) {
      console.error("[Estimate Request] Move error:", moveError);
      // Don't fail the request if move fails, just log it
    }

    return NextResponse.json({
      success: true,
      estimate_request: estimateRequest,
    });
  } catch (error: any) {
    console.error("[Estimate Request] Unexpected error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// GET /api/estimates/request?lead_id=xxx
export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const workspaceId = await getCurrentWorkspaceId();

    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(req.url);
    const leadId = searchParams.get("lead_id");

    if (!leadId) {
      return NextResponse.json(
        { error: "lead_id is required" },
        { status: 400 }
      );
    }

    const { data: estimateRequests, error } = await supabase
      .from("estimate_requests")
      .select("*")
      .eq("lead_id", leadId)
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: error.message || "Failed to fetch estimate requests" },
        { status: 500 }
      );
    }

    return NextResponse.json({ estimate_requests: estimateRequests || [] });
  } catch (error: any) {
    console.error("[Estimate Request GET] Unexpected error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



























