import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.json({ error: "Missing code" }, { status: 400 });

  // Exchange code -> tokens
  const tokenRes = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.MS_CLIENT_ID!,
      client_secret: process.env.MS_CLIENT_SECRET!,
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/outlook/callback`,
      grant_type: "authorization_code",
      code
    })
  }).then(r => r.json());

  if (!tokenRes.access_token) {
    return NextResponse.json({ error: "Token exchange failed", details: tokenRes }, { status: 400 });
  }

  // Who am I?
  const me = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: { Authorization: `Bearer ${tokenRes.access_token}` }
  }).then(r => r.json());

  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/login`);

  const { data: orgRow } = await supabase.rpc("get_primary_org_for_user");
  const org_id = orgRow?.org_id;

  if (!org_id) {
    return NextResponse.json({ error: "No organization found" }, { status: 400 });
  }

  await supabase.from("outlook_accounts").upsert({
    org_id,
    ms_user_id: me.id,
    email: me.mail ?? me.userPrincipalName,
    access_token: tokenRes.access_token,
    refresh_token: tokenRes.refresh_token,
    token_expiry: new Date(Date.now() + (tokenRes.expires_in ?? 3600) * 1000).toISOString()
  }, { onConflict: "org_id" });

  return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/dashboard/integrations?outlook=connected`);
}

