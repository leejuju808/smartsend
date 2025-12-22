import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

/**
 * POST /api/settings/team/roofing/update-role
 * Update a team member's roofing role
 * Block 20840 - Team Permissions v1
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { membership_id, roofing_role } = body;

    if (!membership_id || !roofing_role) {
      return NextResponse.json(
        { error: "membership_id and roofing_role are required" },
        { status: 400 }
      );
    }

    // Validate roofing role
    const validRoles = ["OWNER", "SALES_REP", "OFFICE_STAFF", "ADJUSTER_HELPER"];
    if (!validRoles.includes(roofing_role)) {
      return NextResponse.json(
        { error: `Role must be one of: ${validRoles.join(", ")}` },
        { status: 400 }
      );
    }

    // Check if user is OWNER
    const { data: membership } = await supabase
      .from("org_memberships")
      .select("org_id, roofing_role")
      .eq("user_id", user.id)
      .eq("status", "active")
      .limit(1)
      .single();

    if (!membership || membership.roofing_role !== "OWNER") {
      return NextResponse.json(
        { error: "Only owners can change team member roles" },
        { status: 403 }
      );
    }

    // Get the membership to update
    const { data: targetMembership } = await supabase
      .from("org_memberships")
      .select("org_id, user_id")
      .eq("id", membership_id)
      .eq("org_id", membership.org_id)
      .single();

    if (!targetMembership) {
      return NextResponse.json(
        { error: "Membership not found" },
        { status: 404 }
      );
    }

    // Prevent changing your own role from OWNER
    if (targetMembership.user_id === user.id && roofing_role !== "OWNER") {
      return NextResponse.json(
        { error: "You cannot change your own role from OWNER" },
        { status: 400 }
      );
    }

    // Update role
    const { error: updateError } = await supabase
      .from("org_memberships")
      .update({
        roofing_role: roofing_role,
        role: roofing_role === "OWNER" ? "owner" : roofing_role === "OFFICE_STAFF" ? "admin" : "member",
        updated_at: new Date().toISOString(),
      })
      .eq("id", membership_id);

    if (updateError) {
      console.error("Error updating role:", updateError);
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      message: "Role updated successfully",
    });
  } catch (error: any) {
    console.error("Error updating role:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
















































