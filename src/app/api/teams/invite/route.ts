import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import crypto from "node:crypto";
import { sendMail } from "@/lib/mailer";
import { getTeamPlan } from "@/lib/billing/limits";

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const body = await req.json();
  const { teamId, team_id, email, role, invitedBy } = body;
  
  // Support both teamId and team_id for backwards compatibility
  const finalTeamId = teamId || team_id;
  
  if (!finalTeamId || !email) {
    return NextResponse.json({ error: "teamId and email are required" }, { status: 400 });
  }

  // Verify user has permission to invite (admin or owner)
  const { data: membership } = await supabase
    .from('team_members')
    .select('role')
    .eq('team_id', finalTeamId)
    .eq('user_id', user.id)
    .single();

  if (!membership || !['owner', 'admin'].includes(membership.role)) {
    return NextResponse.json({ error: "Forbidden: admin or owner role required" }, { status: 403 });
  }

  // Validate role - support viewer and editor for campaign permissions
  if (!['admin', 'member', 'viewer', 'editor'].includes(role)) {
    return NextResponse.json({ error: "Invalid role. Must be admin, member, editor, or viewer" }, { status: 400 });
  }

  // Plan gates: check team seat limit
  const plan = await getTeamPlan(finalTeamId);
  if (plan) {
    const { count: currentSeats } = await supabase
      .from("team_members")
      .select("user_id", { count: "exact", head: true })
      .eq("team_id", finalTeamId);

    if ((currentSeats ?? 0) >= plan.team_seats) {
      return NextResponse.json({ 
        error: `You've hit your ${plan.plan} plan seat limit of ${plan.team_seats}. Upgrade to add more team members.` 
      }, { status: 403 });
    }
  }

  const token = crypto.randomBytes(24).toString("base64url");
  const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

  const { error } = await supabase.from("team_invitations").insert({
    team_id: finalTeamId, email, role, token, expires_at: expires, inviter_id: user.id
  });
  
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Send invitation email
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const inviteLink = `${baseUrl}/invite/accept?token=${token}`;
  
  try {
    await sendMail({
      from: process.env.FROM_EMAIL || 'no-reply@smartsend.ai',
      to: email,
      subject: 'You\'ve been invited to join SmartSend',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>You've been invited to join a SmartSend team!</h2>
          <p>You've been invited with the role: <strong>${role}</strong></p>
          <p>Click the button below to accept the invitation:</p>
          <a href="${inviteLink}" style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 20px 0;">
            Accept Invitation
          </a>
          <p style="color: #666; font-size: 14px;">
            This link expires in 7 days. If you didn't expect this invitation, you can safely ignore this email.
          </p>
        </div>
      `,
    });
  } catch (emailError) {
    console.error('Error sending invitation email:', emailError);
    // Don't fail the request if email fails, but log it
  }

  return NextResponse.json({ ok: true, token, link: inviteLink });
}

