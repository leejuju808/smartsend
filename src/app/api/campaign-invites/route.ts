import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(req: NextRequest) {
  const u = new URL(req.url);
  const campaign = u.searchParams.get("campaign");
  if (!campaign) return NextResponse.json({ error: "campaign required" }, { status: 400 });

  const supabase = createRouteHandlerClient({ cookies });

  // Editors/owners will pass RLS to view invites for this campaign
  const { data, error } = await supabase
    .from("campaign_invites")
    .select("id, email, role, created_at, expires_at, accepted_at, accepted_user_id")
    .eq("campaign_id", campaign)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ rows: data ?? [] }, { headers: { "content-type": "application/json" }});
}

export async function POST(req: NextRequest) {
  const { campaign_id, email, role } = await req.json();
  if (!campaign_id || !email || !role) {
    return NextResponse.json({ error: "campaign_id, email, role required" }, { status: 400 });
  }

  const supabase = createRouteHandlerClient({ cookies });

  const { data, error } = await supabase.rpc("create_campaign_invite", {
    p_campaign: campaign_id,
    p_email: email,
    p_role: role
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Return a ready-to-share URL
  const base = process.env.NEXT_PUBLIC_SITE_URL || (new URL(req.url)).origin;
  const inviteUrl = `${base}/invite?token=${encodeURIComponent(String(data))}`;
  return NextResponse.json({ token: data, url: inviteUrl }, { headers: { "content-type": "application/json" }});
}

