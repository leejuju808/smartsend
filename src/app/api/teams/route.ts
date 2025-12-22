// Block 25220 — SmartSend Roofing Multi-Team Support v1
// API Route: Team Management
// GET /api/teams - List teams
// POST /api/teams - Create team

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient();
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("org_id");
    const teamType = searchParams.get("team_type");
    const includeMembers = searchParams.get("include_members") === "true";

    if (!orgId) {
      return NextResponse.json(
        { error: "org_id is required" },
        { status: 400 }
      );
    }

    // Verify user has access to org
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
      .from("roofing_teams")
      .select("*")
      .eq("org_id", orgId)
      .eq("is_active", true)
      .order("created_at", { ascending: true });

    if (teamType) {
      query = query.eq("team_type", teamType);
    }

    const { data: teams, error: teamsError } = await query;

    if (teamsError) {
      console.error("Error fetching teams:", teamsError);
      return NextResponse.json(
        { error: "Failed to fetch teams" },
        { status: 500 }
      );
    }

    // Include members if requested
    if (includeMembers && teams) {
      const teamsWithMembers = await Promise.all(
        teams.map(async (team) => {
          const { data: members } = await supabase
            .from("team_members")
            .select(
              `
              id,
              user_id,
              role,
              assigned_at,
              is_active,
              users:user_id (
                id,
                email
              )
            `
            )
            .eq("team_id", team.id)
            .eq("is_active", true);

          return {
            ...team,
            members: members || [],
          };
        })
      );

      return NextResponse.json({ teams: teamsWithMembers });
    }

    return NextResponse.json({ teams: teams || [] });
  } catch (error) {
    console.error("Error in GET /api/teams:", error);
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
      workspace_id,
      name,
      team_type,
      color,
      crew_id,
      description,
    } = body;

    if (!org_id || !name || !team_type) {
      return NextResponse.json(
        { error: "org_id, name, and team_type are required" },
        { status: 400 }
      );
    }

    // Verify user is owner/admin of org
    const { data: membership } = await supabase
      .from("org_memberships")
      .select("role")
      .eq("org_id", org_id)
      .eq("user_id", user.id)
      .eq("status", "active")
      .single();

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return NextResponse.json(
        { error: "Only owners and admins can create teams" },
        { status: 403 }
      );
    }

    // Create team
    const { data: team, error: teamError } = await supabase
      .from("roofing_teams")
      .insert({
        org_id,
        workspace_id,
        name,
        team_type,
        color,
        crew_id,
        description,
        is_active: true,
      })
      .select()
      .single();

    if (teamError) {
      console.error("Error creating team:", teamError);
      return NextResponse.json(
        { error: "Failed to create team" },
        { status: 500 }
      );
    }

    // Create default calendar filter
    await supabase.from("team_calendar_filters").insert({
      team_id: team.id,
      event_types: getDefaultEventTypes(team_type),
      filter_config: {},
    });

    // Create default task categories
    await supabase.from("team_task_categories").insert({
      team_id: team.id,
      task_categories: getDefaultTaskCategories(team_type),
      can_create: true,
      can_assign_to_teams: [],
    });

    return NextResponse.json({ team }, { status: 201 });
  } catch (error) {
    console.error("Error in POST /api/teams:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

function getDefaultEventTypes(teamType: string): string[] {
  switch (teamType) {
    case "SALES":
      return ["inspection", "appointment", "follow_up"];
    case "INSURANCE":
      return ["adjuster_meeting", "supplement_followup", "acv_tracking"];
    case "OPERATIONS":
      return ["delivery", "permit", "dumpster", "scheduling"];
    case "PRODUCTION":
      return ["install", "repair", "crew_assignment", "weather_shift"];
    case "CREW":
      return ["install", "repair"];
    case "OWNER":
      return ["*"]; // All events
    default:
      return [];
  }
}

function getDefaultTaskCategories(teamType: string): string[] {
  switch (teamType) {
    case "SALES":
      return [
        "lead_follow_up",
        "quote_sent",
        "schedule_inspection",
        "update_lead_notes",
      ];
    case "INSURANCE":
      return [
        "supplement_followup",
        "send_documentation",
        "confirm_acv_released",
      ];
    case "OPERATIONS":
      return [
        "confirm_delivery",
        "order_materials",
        "coordinate_dumpster",
        "reschedule_weather",
      ];
    case "PRODUCTION":
      return [
        "upload_job_photos",
        "complete_punch_list",
        "verify_cleanup",
        "report_decking_issues",
      ];
    case "CREW":
      return [
        "arrival_photos",
        "mid_job_photos",
        "cleanup_photos",
        "completion_report",
      ];
    case "OWNER":
      return ["escalation"]; // Critical escalations only
    default:
      return [];
  }
}




































