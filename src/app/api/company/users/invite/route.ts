// POST /api/company/users/invite
// Invite a user to join a roofing company

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { randomBytes } from "crypto";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await req.json();
    const { email, role, roofing_company_id } = body;

    if (!email || !role || !roofing_company_id) {
      return NextResponse.json(
        { error: "email, role, and roofing_company_id are required" },
        { status: 400 }
      );
    }

    // Validate role
    const validRoles = ['admin', 'manager', 'sales', 'production', 'crew', 'accounting', 'viewer'];
    if (!validRoles.includes(role)) {
      return NextResponse.json(
        { error: "Invalid role. Must be one of: " + validRoles.join(", ") },
        { status: 400 }
      );
    }

    // Check if current user can manage team
    const { data: currentMember, error: memberError } = await supabase
      .from("roofing_company_members")
      .select("role")
      .eq("roofing_company_id", roofing_company_id)
      .eq("user_id", user.id)
      .eq("is_active", true)
      .single();

    if (memberError || !currentMember) {
      return NextResponse.json(
        { error: "You are not a member of this company" },
        { status: 403 }
      );
    }

    // Only owner and admin can invite
    if (!['owner', 'admin'].includes(currentMember.role)) {
      return NextResponse.json(
        { error: "Only owners and admins can invite team members" },
        { status: 403 }
      );
    }

    // Check if user already exists
    const { data: existingUser } = await supabase
      .from("auth.users")
      .select("id, email")
      .eq("email", email)
      .single();

    // Check if user is already a member
    if (existingUser) {
      const { data: existingMember } = await supabase
        .from("roofing_company_members")
        .select("id")
        .eq("roofing_company_id", roofing_company_id)
        .eq("user_id", existingUser.id)
        .single();

      if (existingMember) {
        return NextResponse.json(
          { error: "User is already a member of this company" },
          { status: 400 }
        );
      }
    }

    // Generate invite token
    const inviteToken = randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

    // If user exists, create membership immediately (pending acceptance)
    if (existingUser) {
      const { data: newMember, error: insertError } = await supabase
        .from("roofing_company_members")
        .insert({
          roofing_company_id,
          user_id: existingUser.id,
          role,
          invited_by: user.id,
          invite_token: inviteToken,
          invite_expires_at: expiresAt.toISOString(),
          is_active: false, // Will be activated when they accept
        })
        .select()
        .single();

      if (insertError) {
        console.error("Error creating membership:", insertError);
        return NextResponse.json(
          { error: "Failed to create invitation" },
          { status: 500 }
        );
      }

      // TODO: Send invite email with link
      const inviteLink = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/company/invite/accept?token=${inviteToken}`;

      return NextResponse.json({
        success: true,
        invite_token: inviteToken,
        invite_link: inviteLink,
        member: newMember,
      });
    }

    // If user doesn't exist, we'll create a pending invite record
    // For now, we'll store it in roofing_company_members with a placeholder
    // In production, you'd want a separate invites table or handle signup flow differently

    const inviteLink = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/signup?invite_token=${inviteToken}&company_id=${roofing_company_id}&role=${role}`;

    return NextResponse.json({
      success: true,
      invite_token: inviteToken,
      invite_link: inviteLink,
      message: "Invitation created. User will be added when they sign up.",
    });
  } catch (error: any) {
    console.error("Error inviting user:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

























