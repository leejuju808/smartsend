import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (!code) {
    return NextResponse.json({ error: "missing_code" }, { status: 400 });
  }

  const clientId =
    process.env.GOOGLE_CLIENT_ID ?? process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret =
    process.env.GOOGLE_CLIENT_SECRET ?? process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ??
    process.env.GOOGLE_OAUTH_REDIRECT_URI ??
    `${process.env.NEXT_PUBLIC_APP_URL}/api/oauth/google/callback`;

  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.json(
      { error: "google_oauth_not_configured" },
      { status: 500 }
    );
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  const tokens = await tokenRes.json();
  if (!tokenRes.ok) {
    return NextResponse.json(
      { error: "google_exchange_failed", detail: tokens.error ?? tokens },
      { status: 400 }
    );
  }

  const meRes = await fetch(
    "https://www.googleapis.com/oauth2/v2/userinfo",
    {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    }
  );
  if (!meRes.ok) {
    return NextResponse.json(
      { error: "google_userinfo_failed" },
      { status: 400 }
    );
  }
  const me = await meRes.json();

  const profileRes = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/profile",
    {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    }
  );
  const profile = profileRes.ok ? await profileRes.json() : {};

  const routeClient = createRouteHandlerClient({ cookies });
  const {
    data: { user },
  } = await routeClient.auth.getUser();

  const serviceSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const expiresAt =
    typeof tokens.expires_in === "number"
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;

  await serviceSupabase.from("mail_accounts").upsert(
    {
      user_id: user?.id ?? null,
      provider: "gmail",
      email: me.email,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token ?? null,
      expires_at: expiresAt,
      scope: tokens.scope,
      provider_meta: { historyId: profile?.historyId ?? null },
    },
    { onConflict: "provider,email" }
  );

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const target = "/settings?connected=gmail";

  return base
    ? NextResponse.redirect(`${base}${target}`)
    : NextResponse.redirect(target);
}
