import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/supabase";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  try {
    const { email, role = "member", teamId } = await req.json();
    if (!email) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }

    if (!teamId) {
      return NextResponse.json({ error: "Team ID required" }, { status: 400 });
    }

    // Validate role
    const validRoles = ['owner', 'admin', 'member'];
    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    // Get current user
    const cookieStore = await cookies();
    const { createServerClient } = await import("@supabase/ssr");
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get: (k) => cookieStore.get(k)?.value,
        },
      }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Check if user has permission (owner/admin)
    const { data: member } = await supabaseAdmin
      .from("team_members")
      .select("role")
      .eq("team_id", teamId)
      .eq("user_id", user.id)
      .single();

    if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }

    // Find existing user by email
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", email.toLowerCase())
      .maybeSingle();

    if (!profile) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Create team_invitations entry (proper invitation flow)
    const { createAdminClient } = await import("@/lib/supabase");
    const admin = createAdminClient();
    const { randomBytes } = await import("crypto");
    
    const token = randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(); // 7 days

    const { error: insertError } = await admin
      .from("team_invitations")
      .insert({
        team_id: teamId,
        email: email.toLowerCase(),
        role,
        token,
        inviter_id: user.id,
        expires_at: expiresAt,
      });

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // Send invitation email
    const base = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
    const link = `${base}/api/invite/team/accept?token=${token}`;

    try {
      const { sendEmail } = await import("@/lib/notify/mailer");
      await sendEmail({
        to: email,
        subject: "You've been invited to a team on SmartSend",
        text: `Join the team: ${link}`,
      });
    } catch (emailError) {
      console.error("Failed to send invitation email:", emailError);
      // Continue even if email fails
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Error inviting team member:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
