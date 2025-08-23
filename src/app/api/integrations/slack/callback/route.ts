import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/supabase";
import { getSubscriptionStatus } from "@/lib/subscription";

export async function GET(req: NextRequest) {
  const { userId } = await getSubscriptionStatus();
  if (!userId) return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/settings?err=auth`);
  
  const code = new URL(req.url).searchParams.get("code");
  if (!code) return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/settings?err=slack_no_code`);

  // team_id of caller
  const { data: prof } = await supabaseAdmin.from("profiles").select("team_id").eq("id", userId).maybeSingle();
  if (!prof?.team_id) return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/settings?err=no_team`);

  const r = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type":"application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code, 
      client_id: process.env.SLACK_CLIENT_ID!, 
      client_secret: process.env.SLACK_CLIENT_SECRET!,
      redirect_uri: `${process.env.NEXT_PUBLIC_SITE_URL}/api/integrations/slack/callback`
    })
  });
  
  const j = await r.json();
  if (!j.ok) return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/settings?err=slack_${encodeURIComponent(j.error||"oauth")}`);

  await supabaseAdmin.from("slack_tokens").upsert({
    team_id: prof.team_id,
    access_token: j.access_token,
    bot_user_id: j.bot_user_id || null,
    workspace_id: j.team?.id || null,
    workspace_name: j.team?.name || null,
    updated_at: new Date().toISOString()
  });
  
  await supabaseAdmin.from("slack_settings").upsert({ team_id: prof.team_id });

  return NextResponse.redirect(`${process.env.NEXT_PUBLIC_SITE_URL}/dashboard/settings?slack=connected`);
} 