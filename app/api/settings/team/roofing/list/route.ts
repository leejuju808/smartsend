import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

/**
 * GET /api/settings/team/roofing/list
 * List all team members with roofing roles for the current organization
 * Block 20840 - Team Permissions v1
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's current organization
    const { data: membership } = await supabase
      .from("org_memberships")
      .select("org_id, roofing_role")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "No organization found" },
        { status: 404 }
      );
    }

    const orgId = membership.org_id;

    // Get all active members with their profiles
    const { data: members, error: membersError } = await supabase
      .from("org_memberships")
      .select(`
        id,
        user_id,
        roofing_role,
        role,
        created_at,
        profiles:user_id (
          id,
          email,
          full_name
        )
      `)
      .eq("org_id", orgId)
      .eq("status", "active")
      .order("created_at", { ascending: false });

    if (membersError) {
      console.error("Error fetching members:", membersError);
      return NextResponse.json(
        { error: membersError.message },
        { status: 500 }
      );
    }

    // Get pending invites
    const { data: invites, error: invitesError } = await supabase
      .from("org_memberships")
      .select(`
        id,
        invited_email,
        roofing_role,
        role,
        created_at,
        invited_token
      `)
      .eq("org_id", orgId)
      .eq("status", "pending")
      .is("user_id", null)
      .order("created_at", { ascending: false });

    if (invitesError) {
      console.error("Error fetching invites:", invitesError);
      return NextResponse.json(
        { error: invitesError.message },
        { status: 500 }
      );
    }

    // Format members response
    const formattedMembers = (members || []).map((m: any) => ({
      id: m.id,
      user_id: m.user_id,
      email: m.profiles?.email || null,
      name: m.profiles?.full_name || null,
      roofing_role: m.roofing_role || "SALES_REP",
      role: m.role,
      created_at: m.created_at,
    }));

    // Format invites response
    const formattedInvites = (invites || []).map((i: any) => ({
      id: i.id,
      email: i.invited_email,
      roofing_role: i.roofing_role || "SALES_REP",
      role: i.role,
      created_at: i.created_at,
    }));

    return NextResponse.json({
      members: formattedMembers,
      invites: formattedInvites,
      current_user_role: membership.roofing_role,
    });
  } catch (error: any) {
    console.error("Error listing roofing team:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
















































