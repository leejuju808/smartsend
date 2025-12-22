// Block 57000 — API Route: GET /api/proposals/templates
// Lists proposal templates

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Get user's workspaces
    const { data: workspaces } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id);

    const workspaceIds = workspaces?.map((w) => w.workspace_id) || [];

    if (workspaceIds.length === 0) {
      return NextResponse.json({ templates: [] });
    }

    // Get templates
    const { data: templates, error: templatesError } = await supabase
      .from("proposal_templates")
      .select("*")
      .in("workspace_id", workspaceIds)
      .order("created_at", { ascending: false });

    if (templatesError) {
      console.error("Error fetching templates:", templatesError);
      return NextResponse.json(
        { error: "Failed to fetch templates", details: templatesError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ templates: templates || [] });
  } catch (error) {
    console.error("Error in /api/proposals/templates:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
































