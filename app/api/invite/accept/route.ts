import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

// POST /api/invite/accept - Accept an invitation
export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const body = await req.json();
    const { token, password } = body;

    if (!token) {
      return NextResponse.json(
        { error: "Invite token is required" },
        { status: 400 }
      );
    }

    // Get the invite
    const { data: invite, error: inviteError } = await supabase
      .from("user_invites")
      .select(`
        id,
        account_id,
        email,
        role,
        expires_at,
        accepted,
        billing_accounts!inner(company_name)
      `)
      .eq("token", token)
      .eq("accepted", false)
      .single();

    if (inviteError || !invite) {
      return NextResponse.json(
        { error: "Invalid or expired invite" },
        { status: 400 }
      );
    }

    // Check if invite has expired
    if (new Date(invite.expires_at) < new Date()) {
      return NextResponse.json(
        { error: "Invite has expired" },
        { status: 400 }
      );
    }

    // Get current user (must be logged in)
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: "Must be logged in to accept invite" },
        { status: 401 }
      );
    }

    // Check if user email matches invite email
    if (user.email?.toLowerCase() !== invite.email.toLowerCase()) {
      return NextResponse.json(
        { error: "Invite email does not match your account email" },
        { status: 400 }
      );
    }

    // Check if user already exists in this account
    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .eq("account_id", invite.account_id)
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (existingUser) {
      // Mark invite as accepted even if user already exists
      await supabase
        .from("user_invites")
        .update({ accepted: true })
        .eq("id", invite.id);

      return NextResponse.json({
        ok: true,
        message: "You are already a member of this account",
        account_id: invite.account_id,
      });
    }

    // Create user record
    const { data: newUser, error: userError } = await supabase
      .from("users")
      .insert({
        account_id: invite.account_id,
        auth_user_id: user.id,
        email: invite.email.toLowerCase(),
        role: invite.role,
        invited_by: null, // Could track this if needed
      })
      .select()
      .single();

    if (userError) {
      console.error("Error creating user:", userError);
      return NextResponse.json(
        { error: userError.message },
        { status: 500 }
      );
    }

    // Mark invite as accepted
    await supabase
      .from("user_invites")
      .update({ accepted: true })
      .eq("id", invite.id);

    return NextResponse.json({
      ok: true,
      user: {
        id: newUser.id,
        email: newUser.email,
        role: newUser.role,
      },
      account_id: invite.account_id,
    });
  } catch (error: any) {
    console.error("Error accepting invite:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}

// GET /api/invite/accept?token=xxx - Get invite details
export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { searchParams } = new URL(req.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json(
        { error: "Token is required" },
        { status: 400 }
      );
    }

    // Get the invite
    const { data: invite, error: inviteError } = await supabase
      .from("user_invites")
      .select(`
        id,
        email,
        role,
        expires_at,
        accepted,
        billing_accounts!inner(company_name)
      `)
      .eq("token", token)
      .single();

    if (inviteError || !invite) {
      return NextResponse.json(
        { error: "Invalid invite token" },
        { status: 400 }
      );
    }

    if (invite.accepted) {
      return NextResponse.json(
        { error: "Invite has already been accepted" },
        { status: 400 }
      );
    }

    if (new Date(invite.expires_at) < new Date()) {
      return NextResponse.json(
        { error: "Invite has expired" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      email: invite.email,
      role: invite.role,
      company_name: invite.billing_accounts?.company_name || "SmartSend",
      expires_at: invite.expires_at,
    });
  } catch (error: any) {
    console.error("Error fetching invite:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
