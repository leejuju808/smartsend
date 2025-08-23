import { NextRequest, NextResponse } from "next/server";
import { getSubscriptionStatus } from "@/lib/subscription";
import { supabaseAdmin } from "@/server/supabase";
import { syncSeatsToStripe } from "@/lib/seatBilling";

export async function POST(req: NextRequest) {
  const { userId } = await getSubscriptionStatus();
  if (!userId) return NextResponse.json({ error: "Not authed" }, { status: 401 });

  const { token } = await req.json();
  if (!token) return NextResponse.json({ error: "Token required" }, { status: 400 });

  const { data: inv } = await supabaseAdmin
    .from("team_invitations")
    .select("*")
    .eq("token", token)
    .eq("accepted", false)
    .maybeSingle();
    
  if (!inv) return NextResponse.json({ error: "Invalid or used invite" }, { status: 400 });
  
  // Check if invite is expired
  if (inv.expires_at && new Date(inv.expires_at) < new Date()) {
    return NextResponse.json({ error: "Invite expired" }, { status: 400 });
  }

  // attach user to team
  await supabaseAdmin.from("profiles").update({ team_id: inv.team_id }).eq("id", userId);
  await supabaseAdmin.from("team_members").upsert({ 
    team_id: inv.team_id, 
    user_id: userId, 
    role: inv.role || 'member' 
  });
  await supabaseAdmin.from("team_invitations").update({ 
    accepted: true, 
    accepted_by: userId,
    accepted_at: new Date().toISOString()
  }).eq("id", inv.id);

  // sync seats
  await syncSeatsToStripe(inv.team_id);

  return NextResponse.json({ ok: true });
} 