import { NextRequest, NextResponse } from "next/server";
import { getSubscriptionStatus } from "@/lib/subscription";
import { supabaseAdmin } from "@/server/supabase";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  const { userId } = await getSubscriptionStatus();
  if (!userId) return NextResponse.json({ error: "Not authed" }, { status: 401 });

  const { email } = await req.json();
  if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 });

  const { data: prof } = await supabaseAdmin.from("profiles").select("team_id").eq("id", userId).maybeSingle();
  if (!prof?.team_id) return NextResponse.json({ error: "No team" }, { status: 400 });

  const token = crypto.randomBytes(16).toString("hex");
  await supabaseAdmin.from("team_invitations").insert({ 
    team_id: prof.team_id, 
    email: email.toLowerCase(), 
    token,
    inviter_id: userId,
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
  });

  // TODO: Implement email sending for team invitations
  // For now, the invitation link can be shared manually
  console.log(`Team invitation sent to ${email}. Invite link: ${process.env.NEXT_PUBLIC_SITE_URL}/team/accept?token=${token}`);

  return NextResponse.json({ ok: true });
} 