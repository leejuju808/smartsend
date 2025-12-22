// Block 25220 — SmartSend Roofing Multi-Team Support v1
// API Route: Assignment Rules Management
// GET /api/teams/assignment-rules - List assignment rules
// POST /api/teams/assignment-rules - Create assignment rule

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("org_id");
    const targetType = searchParams.get("target_type");

    if (!orgId) {
      return NextResponse.json(
        { error: "org_id is required" },
        { status: 400 }
      );
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify access
    const { data: membership } = await supabase
      .from("org_memberships")
      .select("org_id, role")
      .eq("org_id", orgId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Build query
    let query = supabase
      .from("team_assignment_rules")
      .select("*")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .order("priority", { ascending: true });

    if (targetType) {
      query = query.eq("target_type", targetType);
    }

    const { data: rules, error: rulesError } = await query;

    if (rulesError) {
      console.error("Error fetching assignment rules:", rulesError);
      return NextResponse.json(
        { error: "Failed to fetch assignment rules" },
        { status: 500 }
      );
    }

    return NextResponse.json({ rules: rules || [] });
  } catch (error) {
    console.error("Error in GET /api/teams/assignment-rules:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      org_id,
      team_id,
      target_type,
      name,
      description,
      config,
      priority = 100,
    } = body;

    if (!org_id || !target_type || !name || !config) {
      return NextResponse.json(
        {
          error:
            "org_id, target_type, name, and config are required",
        },
        { status: 400 }
      );
    }

    // Verify user is owner/admin
    const { data: membership } = await supabase
      .from("org_memberships")
      .select("role")
      .eq("org_id", org_id)
      .eq("user_id", user.id)
      .eq("status", "active")
      .single();

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return NextResponse.json(
        { error: "Only owners and admins can create assignment rules" },
        { status: 403 }
      );
    }

    // Create rule
    const { data: rule, error: ruleError } = await supabase
      .from("team_assignment_rules")
      .insert({
        org_id,
        team_id,
        target_type,
        name,
        description,
        config,
        priority,
        is_active: true,
        created_by_user_id: user.id,
      })
      .select()
      .single();

    if (ruleError) {
      console.error("Error creating assignment rule:", ruleError);
      return NextResponse.json(
        { error: "Failed to create assignment rule" },
        { status: 500 }
      );
    }

    return NextResponse.json({ rule }, { status: 201 });
  } catch (error) {
    console.error("Error in POST /api/teams/assignment-rules:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}




































