// Block 75000 — Automation Templates API
// POST /api/automation/templates - Create default automation templates for workspace

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

    // Get user for auth check
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { company_id = null } = body;

    // Call the database function to create default templates
    const { error: templateError } = await supabase.rpc(
      "create_default_automation_templates",
      {
        p_company_id: company_id,
        p_workspace_id: workspaceId,
      }
    );

    if (templateError) {
      console.error("[Automation Templates] Create error:", templateError);
      return NextResponse.json(
        { error: "Failed to create automation templates" },
        { status: 500 }
      );
    }

    // Fetch the created templates
    const { data: templates, error: fetchError } = await supabase
      .from("automation_rules")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(5);

    if (fetchError) {
      console.error("[Automation Templates] Fetch error:", fetchError);
    }

    return NextResponse.json({
      success: true,
      templates: templates || [],
      message: "Default automation templates created successfully",
    });
  } catch (error: any) {
    console.error("[Automation Templates] Unexpected error:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



























