import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const { token } = await req.json();
  
  if (!token) {
    return NextResponse.json({ error: "token is required" }, { status: 400 });
  }

  const { data: invite, error } = await supabase
    .from("team_invites")
    .select("*")
    .eq("token", token)
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
    
  if (error || !invite) {
    return NextResponse.json({ error: "invalid or expired invite" }, { status: 400 });
  }

  // Verify the invite email matches user's email
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (authUser?.email?.toLowerCase() !== invite.email.toLowerCase()) {
    return NextResponse.json({ error: "invite email does not match your account" }, { status: 403 });
  }

  // Check if user is already a member
  const { data: existing } = await supabase
    .from("team_members")
    .select("role")
    .eq("team_id", invite.team_id)
    .eq("user_id", user.id)
    .single();

  if (existing) {
    // Already a member, just mark invite as accepted if not already
    await supabase
      .from("team_invites")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", invite.id);
    return NextResponse.json({ ok: true, team_id: invite.team_id, already_member: true });
  }

  // Upsert member
  const { error: upErr } = await supabase.from("team_members").upsert({
    team_id: invite.team_id, user_id: user.id, role: invite.role
  }, {
    onConflict: 'team_id,user_id'
  });
  
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });

  await supabase.from("team_invites").update({ accepted_at: new Date().toISOString() }).eq("id", invite.id);
  
  return NextResponse.json({ ok: true, team_id: invite.team_id });
}

