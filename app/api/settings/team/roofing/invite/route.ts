import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";

/**
 * POST /api/settings/team/roofing/invite
 * Invite a team member with roofing role
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
    const { email, roofing_role } = body;

    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    // Validate roofing role
    const validRoles = ["OWNER", "SALES_REP", "OFFICE_STAFF", "ADJUSTER_HELPER"];
    const role = roofing_role || "SALES_REP";
    
    if (!validRoles.includes(role)) {
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
        { error: "Only owners can invite team members" },
        { status: 403 }
      );
    }

    const orgId = membership.org_id;

    // Check if user already exists in this org
    const { data: existingUser } = await supabase
      .from("auth.users")
      .select("id")
      .eq("email", email.toLowerCase())
      .maybeSingle();

    if (existingUser) {
      const { data: existingMember } = await supabase
        .from("org_memberships")
        .select("id")
        .eq("org_id", orgId)
        .eq("user_id", existingUser.id)
        .eq("status", "active")
        .maybeSingle();

      if (existingMember) {
        return NextResponse.json(
          { error: "User is already a member of this organization" },
          { status: 400 }
        );
      }
    }

    // Check if there's a pending invite
    const { data: existingInvite } = await supabase
      .from("org_memberships")
      .select("id")
      .eq("org_id", orgId)
      .eq("invited_email", email.toLowerCase())
      .eq("status", "pending")
      .is("user_id", null)
      .maybeSingle();

    if (existingInvite) {
      return NextResponse.json(
        { error: "Invite already sent to this email" },
        { status: 400 }
      );
    }

    // Generate invite token
    const token = randomBytes(32).toString("hex");

    // Create invite
    const { data: invite, error: inviteError } = await supabase
      .from("org_memberships")
      .insert({
        org_id: orgId,
        invited_email: email.toLowerCase(),
        roofing_role: role,
        role: role === "OWNER" ? "owner" : role === "OFFICE_STAFF" ? "admin" : "member",
        status: "pending",
        invited_token: token,
        invited_by: user.id,
      })
      .select()
      .single();

    if (inviteError) {
      console.error("Error creating invite:", inviteError);
      return NextResponse.json(
        { error: inviteError.message },
        { status: 500 }
      );
    }

    // Get organization name for email
    const { data: org } = await supabase
      .from("organizations")
      .select("name")
      .eq("id", orgId)
      .single();

    const orgName = org?.name || "SmartSend";
    const inviteLink = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/invite?token=${token}`;

    // Send invitation email (optional - can be handled by email service)
    // For now, return the invite link

    return NextResponse.json({
      ok: true,
      invite: {
        id: invite.id,
        email: invite.invited_email,
        roofing_role: invite.roofing_role,
        created_at: invite.created_at,
      },
      invite_link: inviteLink,
    });
  } catch (error: any) {
    console.error("Error inviting user:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
















































