import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(req: Request) {
  const sb = createRouteHandlerClient({ cookies });
  const { token } = await req.json();

  if (!token) {
    return NextResponse.json({ error: "token is required" }, { status: 400 });
  }

  // Find valid invite
  const { data: inv, error: inviteError } = await sb
    .from("invites")
    .select("*")
    .eq("token", token)
    .gt("expires_at", new Date().toISOString())
    .is("accepted_at", null)
    .single();

  if (inviteError || !inv) {
    return NextResponse.json({ error: "invalid token" }, { status: 400 });
  }

  // Ensure user is logged in
  const { data: { user }, error: authError } = await sb.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // Verify email matches (optional but recommended)
  if (user.email?.toLowerCase() !== inv.email.toLowerCase()) {
    return NextResponse.json({ error: "email mismatch" }, { status: 403 });
  }

  // Check seat availability before adding member
  const { checkSeatAvailability } = await import("@/lib/authz/seats");
  const seatCheck = await checkSeatAvailability(inv.team_id);
  if (!seatCheck.ok) {
    return NextResponse.json({ 
      error: "seats_exceeded", 
      reason: seatCheck.reason,
      seats_used: seatCheck.seats_used,
      seats_allowed: seatCheck.seats_allowed
    }, { status: 402 });
  }

  // Ensure user is a team member (or auto-add as member)
  const { error: teamMemberError } = await sb
    .from("team_members")
    .upsert({
      team_id: inv.team_id,
      user_id: user.id,
      role: 'member'
    }, { 
      onConflict: "team_id,user_id",
      ignoreDuplicates: false
    });

  if (teamMemberError) {
    return NextResponse.json({ error: teamMemberError.message }, { status: 400 });
  }

  // Add campaign role if campaign_id is set
  if (inv.campaign_id) {
    const { error: campaignMemberError } = await sb
      .from("campaign_members")
      .upsert({
        campaign_id: inv.campaign_id,
        user_id: user.id,
        role: inv.role
      }, { 
        onConflict: "campaign_id,user_id",
        ignoreDuplicates: false
      });

    if (campaignMemberError) {
      return NextResponse.json({ error: campaignMemberError.message }, { status: 400 });
    }
  }

  // Mark invite as accepted
  const { error: updateError } = await sb
    .from("invites")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", inv.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  // Log acceptance
  await sb.from("audit_logs").insert({
    team_id: inv.team_id,
    user_id: user.id,
    action: "invite.accept",
    entity: "campaign",
    entity_id: inv.campaign_id,
    meta: { user_id: user.id, email: inv.email, role: inv.role }
  });

  return NextResponse.json({ ok: true });
}
