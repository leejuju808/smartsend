// Block 25220 — SmartSend Roofing Multi-Team Support v1
// API Route: Remove Team Member
// DELETE /api/teams/[id]/members/[userId] - Remove member from team
// PATCH /api/teams/[id]/members/[userId] - Update member role

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function DELETE(
  req: NextRequest,
  {
    params,
  }: { params: Promise<{ id: string; userId: string }> }
) {
  try {
    const supabase = createClient();
    const { id, userId } = await params;

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
        { error: "Only team leaders, owners, or admins can remove members" },
        { status: 403 }
      );
    }

    // Soft delete (set is_active = false)
    const { error: deleteError } = await supabase
      .from("team_members")
      .update({ is_active: false })
      .eq("team_id", id)
      .eq("user_id", userId);

    if (deleteError) {
      console.error("Error removing team member:", deleteError);
      return NextResponse.json(
        { error: "Failed to remove team member" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in DELETE /api/teams/[id]/members/[userId]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  {
    params,
  }: { params: Promise<{ id: string; userId: string }> }
) {
  try {
    const supabase = createClient();
    const { id, userId } = await params;

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { role } = body;

    if (!role) {
      return NextResponse.json(
        { error: "role is required" },
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
        { error: "Only team leaders, owners, or admins can update member roles" },
        { status: 403 }
      );
    }

    // Update role
    const { data: updatedMember, error: updateError } = await supabase
      .from("team_members")
      .update({ role })
      .eq("team_id", id)
      .eq("user_id", userId)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating team member role:", updateError);
      return NextResponse.json(
        { error: "Failed to update team member role" },
        { status: 500 }
      );
    }

    return NextResponse.json({ member: updatedMember });
  } catch (error) {
    console.error("Error in PATCH /api/teams/[id]/members/[userId]:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}




































