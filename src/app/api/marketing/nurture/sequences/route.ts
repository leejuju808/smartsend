/**
 * Block 25420 — SmartSend Roofing Marketing Engine v1
 * Lead Nurture Sequences API
 * 
 * GET /api/marketing/nurture/sequences - List nurture sequences
 * POST /api/marketing/nurture/sequences - Create nurture sequence
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

    // Build query
    let query = supabase
      .from("lead_nurture_sequences")
      .select("*")
      .order("created_at", { ascending: false });

    // Filter by workspace (NULL = global sequences)
    if (workspaceId) {
      query = query.or(`workspace_id.eq.${workspaceId},workspace_id.is.null`);
    } else {
      query = query.is("workspace_id", null); // Only global sequences
    }

    const { data: sequences, error } = await query;

    if (error) {
      console.error("Error fetching nurture sequences:", error);
      return NextResponse.json({ error: "Failed to fetch sequences" }, { status: 500 });
    }

    return NextResponse.json({ sequences });
  } catch (error: any) {
    console.error("Error in GET /api/marketing/nurture/sequences:", error);
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
      name,
      description,
      steps,
      target_lead_age_days,
      target_statuses,
      is_active,
    } = body;

    // Validation
    if (!name || !steps || !Array.isArray(steps) || steps.length === 0) {
      return NextResponse.json(
        { error: "Missing required fields: name, steps (array)" },
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

    // Create sequence
    const { data: sequence, error } = await supabase
      .from("lead_nurture_sequences")
      .insert({
        workspace_id: workspace_id || null,
        name,
        description: description || null,
        steps,
        target_lead_age_days: target_lead_age_days || 30,
        target_statuses: target_statuses || [],
        is_active: is_active !== undefined ? is_active : true,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating nurture sequence:", error);
      return NextResponse.json({ error: "Failed to create sequence" }, { status: 500 });
    }

    return NextResponse.json({ sequence }, { status: 201 });
  } catch (error: any) {
    console.error("Error in POST /api/marketing/nurture/sequences:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}




































