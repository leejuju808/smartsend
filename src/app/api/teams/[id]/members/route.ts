// Block 25220 — SmartSend Roofing Multi-Team Support v1
// API Route: Team Members Management
// GET /api/teams/[id]/members - List team members
// POST /api/teams/[id]/members - Add member to team
// DELETE /api/teams/[id]/members/[userId] - Remove member from team

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
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

    // Verify access to team
    const { data: team } = await supabase
      .from("roofing_teams")
      .select("org_id")
      .eq("id", id)
      .single();

    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

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

    // Get team members
    const { data: members, error: membersError } = await supabase
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
      .eq("is_active", true)
      .order("assigned_at", { ascending: true });

    if (membersError) {
      console.error("Error fetching team members:", membersError);
      return NextResponse.json(
        { error: "Failed to fetch team members" },
        { status: 500 }
      );
    }

    return NextResponse.json({ members: members || [] });
  } catch (error) {
    console.error("Error in GET /api/teams/[id]/members:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(
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

    const body = await req.json();
    const { user_id, role = "member" } = body;

    if (!user_id) {
      return NextResponse.json(
        { error: "user_id is required" },
        { status: 400 }
      );
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

    // Verify user is team leader or org owner/admin
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

    const canManage =
      membership?.role === "owner" ||
      membership?.role === "admin" ||
      teamMember?.role === "leader";

    if (!canManage) {
      return NextResponse.json(
        { error: "Only team leaders, owners, or admins can add members" },
        { status: 403 }
      );
    }

    // Verify target user is in org
    const { data: targetMembership } = await supabase
      .from("org_memberships")
      .select("org_id")
      .eq("org_id", team.org_id)
      .eq("user_id", user_id)
      .eq("status", "active")
      .single();

    if (!targetMembership) {
      return NextResponse.json(
        { error: "User must be a member of the organization" },
        { status: 400 }
      );
    }

    // Check if already a member
    const { data: existingMember } = await supabase
      .from("team_members")
      .select("id")
      .eq("team_id", id)
      .eq("user_id", user_id)
      .single();

    if (existingMember) {
      // Reactivate if inactive
      const { data: updatedMember, error: updateError } = await supabase
        .from("team_members")
        .update({ is_active: true, role })
        .eq("id", existingMember.id)
        .select()
        .single();

      if (updateError) {
        console.error("Error updating team member:", updateError);
        return NextResponse.json(
          { error: "Failed to add team member" },
          { status: 500 }
        );
      }

      return NextResponse.json({ member: updatedMember });
    }

    // Add member
    const { data: member, error: memberError } = await supabase
      .from("team_members")
      .insert({
        team_id: id,
        user_id,
        role,
        assigned_by_user_id: user.id,
        is_active: true,
      })
      .select()
      .single();

    if (memberError) {
      console.error("Error adding team member:", memberError);
      return NextResponse.json(
        { error: "Failed to add team member" },
        { status: 500 }
      );
    }

    return NextResponse.json({ member }, { status: 201 });
  } catch (error) {
    console.error("Error in POST /api/teams/[id]/members:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}




































