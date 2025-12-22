import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect("/settings/email?err=no_code");

  // token exchange
  const tokenRes = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.MS_CLIENT_ID!,
      client_secret: process.env.MS_CLIENT_SECRET!,
      redirect_uri: process.env.MS_REDIRECT_URI!,
      grant_type: "authorization_code",
      code
    })
  });
  if (!tokenRes.ok) return NextResponse.redirect("/settings/email?err=ms_token");
  const tok = await tokenRes.json();
  const access_token = tok.access_token as string;
  const refresh_token = tok.refresh_token as string;
  const token_expires_at = new Date(Date.now() + (tok.expires_in ?? 3600) * 1000).toISOString();

  // get email address
  const meRes = await fetch("https://graph.microsoft.com/v1.0/me", { headers: { Authorization: `Bearer ${access_token}` } });
  const me = await meRes.json();
  const email_address = me.mail || me.userPrincipalName;

  const s = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: () => cookies() });
  const { data: { user } } = await s.auth.getUser();
  if (!user) return NextResponse.redirect("/settings/email?err=signin");

  const { error } = await s.from("user_connections").upsert({
    user_id: user.id,
    provider: "outlook",
    access_token,
    refresh_token,
    token_expires_at,
    email_address
  }, { onConflict: "user_id,provider" });
  if (error) return NextResponse.redirect("/settings/email?err=db");

  return NextResponse.redirect("/settings/email?ok=connected_outlook");
}


