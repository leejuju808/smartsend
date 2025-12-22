// Block 25220 — SmartSend Roofing Multi-Team Support v1
// API Route: Team Management (Single Team)
// GET /api/teams/[id] - Get team
// PATCH /api/teams/[id] - Update team
// DELETE /api/teams/[id] - Delete team

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient();
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const includeMembers = searchParams.get("include_members") === "true";

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get team
    const { data: team, error: teamError } = await supabase
      .from("roofing_teams")
      .select("*")
      .eq("id", id)
      .single();

    if (teamError || !team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    // Verify access
    const { data: membership } = await supabase
      .from("org_memberships")
      .select("org_id")
      .eq("org_id", team.org_id)
      .eq("user_id", user.id)
      .eq("status", "active")
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Include members if requested
    if (includeMembers) {
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
        .eq("team_id", id)
        .eq("is_active", true);

      return NextResponse.json({
        team: {
          ...team,
          members: members || [],
        },
      });
    }

    return NextResponse.json({ team });
  } catch (error) {
    console.error("Error in GET /api/teams/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient();
    const { id } = await params;

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get team
    const { data: team } = await supabase
      .from("roofing_teams")
      .select("org_id")
      .eq("id", id)
      .single();

    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    // Verify user is owner/admin or team leader
    const { data: membership } = await supabase
      .from("org_memberships")
      .select("role")
      .eq("org_id", team.org_id)
      .eq("user_id", user.id)
      .eq("status", "active")
      .single();

    const { data: teamMember } = await supabase
      .from("team_members")
      .select("role")
      .eq("team_id", id)
      .eq("user_id", user.id)
      .eq("is_active", true)
      .single();

    const canEdit =
      membership?.role === "owner" ||
      membership?.role === "admin" ||
      teamMember?.role === "leader";

    if (!canEdit) {
      return NextResponse.json(
        { error: "Only owners, admins, or team leaders can update teams" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { name, color, description, is_active } = body;

    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (color !== undefined) updates.color = color;
    if (description !== undefined) updates.description = description;
    if (is_active !== undefined) updates.is_active = is_active;

    const { data: updatedTeam, error: updateError } = await supabase
      .from("roofing_teams")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating team:", updateError);
      return NextResponse.json(
        { error: "Failed to update team" },
        { status: 500 }
      );
    }

    return NextResponse.json({ team: updatedTeam });
  } catch (error) {
    console.error("Error in PATCH /api/teams/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = createClient();
    const { id } = await params;

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get team
    const { data: team } = await supabase
      .from("roofing_teams")
      .select("org_id")
      .eq("id", id)
      .single();

    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    // Verify user is owner/admin
    const { data: membership } = await supabase
      .from("org_memberships")
      .select("role")
      .eq("org_id", team.org_id)
      .eq("user_id", user.id)
      .eq("status", "active")
      .single();

    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return NextResponse.json(
        { error: "Only owners and admins can delete teams" },
        { status: 403 }
      );
    }

    // Soft delete (set is_active = false)
    const { error: deleteError } = await supabase
      .from("roofing_teams")
      .update({ is_active: false })
      .eq("id", id);

    if (deleteError) {
      console.error("Error deleting team:", deleteError);
      return NextResponse.json(
        { error: "Failed to delete team" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in DELETE /api/teams/[id]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}




































