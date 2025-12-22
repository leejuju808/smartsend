import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { randomUUID } from "crypto";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const sb = createRouteHandlerClient({ cookies });
  
  // Get authenticated user
  const { data: { user }, error: authError } = await sb.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { email, role } = await req.json(); // role: 'viewer' | 'editor'

  if (!email || !role || !['viewer', 'editor'].includes(role)) {
    return NextResponse.json({ error: "email and role (viewer|editor) are required" }, { status: 400 });
  }

  // Verify caller is owner/admin of team OR campaign editor
  const { data: camp, error: campError } = await sb
    .from("campaigns")
    .select("id, team_id")
    .eq("id", params.id)
    .single();
  
  if (campError || !camp) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Check caller permission via team_members/campaign_members
  const { data: teamMember } = await sb
    .from("team_members")
    .select("role")
    .eq("team_id", camp.team_id)
    .eq("user_id", user.id)
    .single();

  const { data: campaignMember } = await sb
    .from("campaign_members")
    .select("role")
    .eq("campaign_id", params.id)
    .eq("user_id", user.id)
    .single();

  // Check if user has permission to invite
  const canInvite = 
    (teamMember && ['owner', 'admin'].includes(teamMember.role)) ||
    (campaignMember && campaignMember.role === 'editor');

  if (!canInvite) {
    return NextResponse.json({ error: "Forbidden: insufficient permissions" }, { status: 403 });
  }

  // Check seat availability (if billing is enforced)
  const { checkSeatAvailability } = await import("@/lib/authz/seats");
  const seatCheck = await checkSeatAvailability(camp.team_id);
  if (!seatCheck.ok) {
    return NextResponse.json({ 
      error: "seats_exceeded", 
      reason: seatCheck.reason,
      seats_used: seatCheck.seats_used,
      seats_allowed: seatCheck.seats_allowed
    }, { status: 402 });
  }

  const token = randomUUID();
  const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(); // 7 days

  const { error: inviteError } = await sb.from("invites").insert({
    team_id: camp.team_id,
    campaign_id: camp.id,
    email,
    role,
    token,
    expires_at: expires
  });

  if (inviteError) {
    return NextResponse.json({ error: inviteError.message }, { status: 400 });
  }

  // Send email w/ magic link (your mailer)
  // TODO: Implement email sending
  // await sendInviteEmail(email, `${process.env.NEXT_PUBLIC_APP_URL}/accept?token=${token}`);

  await sb.from("audit_logs").insert({
    team_id: camp.team_id,
    user_id: user.id,
    action: "invite.create",
    entity: "campaign",
    entity_id: camp.id,
    meta: { email, role }
  });

  return NextResponse.json({ ok: true, token });
}

