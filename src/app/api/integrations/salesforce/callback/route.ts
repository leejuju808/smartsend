import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/supabase";
import { getSubscriptionStatus } from "@/lib/subscription";

export async function GET(req: NextRequest) {
  const { userId } = await getSubscriptionStatus();
  if (!userId) return NextResponse.redirect(new URL("/dashboard/settings?err=auth", process.env.NEXT_PUBLIC_SITE_URL));
  
  const code = new URL(req.url).searchParams.get("code");
  if (!code) return NextResponse.redirect(new URL("/dashboard/settings?err=sf_no_code", process.env.NEXT_PUBLIC_SITE_URL));

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: process.env.SALESFORCE_CLIENT_ID!,
    client_secret: process.env.SALESFORCE_CLIENT_SECRET!,
    redirect_uri: `${process.env.NEXT_PUBLIC_SITE_URL}/api/integrations/salesforce/callback`,
  });

  const tokenRes = await fetch(`${process.env.SALESFORCE_LOGIN_BASE || "https://login.salesforce.com"}/services/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  
  const t = await tokenRes.json();
  if (!tokenRes.ok) {
    return NextResponse.redirect(
      new URL(`/dashboard/settings?err=sf_${encodeURIComponent(t?.error_description||"oauth")}`, process.env.NEXT_PUBLIC_SITE_URL)
    );
  }

  // Get team_id of caller
  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("team_id")
    .eq("id", userId)
    .maybeSingle();
    
  if (!prof?.team_id) return NextResponse.redirect(new URL("/dashboard/settings?err=no_team", process.env.NEXT_PUBLIC_SITE_URL));

  await supabaseAdmin.from("salesforce_tokens").upsert({
    team_id: prof.team_id,
    instance_url: t.instance_url,
    access_token: t.access_token,
    refresh_token: t.refresh_token,
    org_id: t.id, // URL includes org/user ids; store raw for reference
    user_id: t.id,
    updated_at: new Date().toISOString()
  });

  return NextResponse.redirect(new URL("/dashboard/settings?salesforce=connected", process.env.NEXT_PUBLIC_SITE_URL));
} 