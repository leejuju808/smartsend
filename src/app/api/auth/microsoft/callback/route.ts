import { NextResponse } from "next/server";
import { encrypt } from "@/lib/crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (!code) return NextResponse.json({ error: "missing code" }, { status: 400 });

  const tokenRes = await fetch(`https://login.microsoftonline.com/${process.env.MS_TENANT!}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.MS_CLIENT_ID!,
      client_secret: process.env.MS_CLIENT_SECRET!,
      code,
      redirect_uri: process.env.MS_REDIRECT_URI!,
      grant_type: "authorization_code"
    })
  }).then(r => r.json() as any);

  if (!tokenRes.access_token) return NextResponse.json({ error: tokenRes.error_description || "token exchange failed" }, { status: 400 });

  const me = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: { Authorization: `Bearer ${tokenRes.access_token}` }
  }).then(r => r.json() as any);

  const supa = createClient();
  const { data: { user } } = await supa.auth.getUser();
  if (!user) return NextResponse.redirect("/login");

  const now = new Date();
  const exp = new Date(now.getTime() + (tokenRes.expires_in ?? 3600) * 1000);
  const { error } = await supabaseAdmin.from("sender_profiles").insert({
    user_id: user.id,
    provider: "outlook",
    email: me.userPrincipalName,
    display_name: me.displayName ?? null,
    access_token: encrypt(tokenRes.access_token),
    refresh_token: tokenRes.refresh_token ? encrypt(tokenRes.refresh_token) : null,
    expires_at: exp.toISOString(),
    provider_meta: { scope: tokenRes.scope }
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.redirect("/dashboard/settings/senders");
}

