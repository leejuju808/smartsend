/**
 * Block 25420 — SmartSend Roofing Marketing Engine v1
 * Seasonal Templates API
 * 
 * GET /api/marketing/seasonal-templates - List seasonal templates
 * POST /api/marketing/seasonal-templates - Create a seasonal template
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspace_id");
    const season = searchParams.get("season");

    // Build query
    let query = supabase
      .from("seasonal_templates")
      .select("*")
      .order("created_at", { ascending: false });

    // Filter by workspace (NULL = global templates)
    if (workspaceId) {
      query = query.or(`workspace_id.eq.${workspaceId},workspace_id.is.null`);
    } else {
      query = query.is("workspace_id", null); // Only global templates
    }

    // Filter by season
    if (season) {
      query = query.eq("season", season);
    }

    const { data: templates, error } = await query;

    if (error) {
      console.error("Error fetching seasonal templates:", error);
      return NextResponse.json({ error: "Failed to fetch templates" }, { status: 500 });
    }

    return NextResponse.json({ templates });
  } catch (error: any) {
    console.error("Error in GET /api/marketing/seasonal-templates:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      workspace_id,
      season,
      template_name,
      subject_template,
      body_template,
      description,
      use_case,
      tags,
    } = body;

    // Validation
    if (!season || !template_name || !subject_template || !body_template) {
      return NextResponse.json(
        { error: "Missing required fields: season, template_name, subject_template, body_template" },
        { status: 400 }
      );
    }

    // Verify workspace access if workspace_id provided
    if (workspace_id) {
      const { data: workspaceMember } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("workspace_id", workspace_id)
        .eq("user_id", user.id)
        .single();

      if (!workspaceMember) {
        return NextResponse.json({ error: "Workspace access denied" }, { status: 403 });
      }
    }

    // Create template
    const { data: template, error } = await supabase
      .from("seasonal_templates")
      .insert({
        workspace_id: workspace_id || null,
        season,
        template_name,
        subject_template,
        body_template,
        description: description || null,
        use_case: use_case || null,
        tags: tags || [],
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating seasonal template:", error);
      return NextResponse.json({ error: "Failed to create template" }, { status: 500 });
    }

    return NextResponse.json({ template }, { status: 201 });
  } catch (error: any) {
    console.error("Error in POST /api/marketing/seasonal-templates:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




































