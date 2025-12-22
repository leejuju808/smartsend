import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

export async function GET(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  if (!code) return NextResponse.redirect("/settings/integrations?error=no_code");

  const redirectPath = process.env.NEXT_PUBLIC_GOOGLE_OAUTH_REDIRECT || "/api/google/oauth/callback";
  const redirectUri = new URL(redirectPath, process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").toString();

  // 1) Exchange code for tokens
  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) return NextResponse.redirect("/settings/integrations?error=token_exchange_failed");
  const tokenJson = await tokenRes.json();

  const accessToken = tokenJson.access_token as string;
  const refreshToken = tokenJson.refresh_token as string | undefined; // present on first consent
  const expiresIn = tokenJson.expires_in as number;
  const expiryIso = new Date(Date.now() + (expiresIn ?? 0) * 1000).toISOString();

  // 2) Identify user (Supabase session)
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) return NextResponse.redirect("/auth?error=not_logged_in");

  // 3) Get email from Google
  const profileRes = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!profileRes.ok) return NextResponse.redirect("/settings/integrations?error=profile_failed");
  const profile = await profileRes.json();
  const email = profile.email as string;

  // 4) Upsert gmail_accounts
  // If refresh_token is missing (user had already granted), keep existing one.
  const { data: existing } = await supabase
    .from("gmail_accounts")
    .select("refresh_token")
    .eq("user_id", user.id)
    .maybeSingle();

  const rtToSave = refreshToken ?? existing?.refresh_token;
  if (!rtToSave) return NextResponse.redirect("/settings/integrations?error=no_refresh_token");

  const { error: upsertErr } = await supabase.from("gmail_accounts").upsert({
    user_id: user.id,
    email,
    access_token: accessToken,
    refresh_token: rtToSave,
    token_expiry: expiryIso,
    updated_at: new Date().toISOString(),
  });
  if (upsertErr) return NextResponse.redirect("/settings/integrations?error=db_upsert_failed");

  return NextResponse.redirect("/settings/integrations?connected=gmail");
}
