import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect("/settings/email?err=no_code");

  // Exchange code → tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) return NextResponse.redirect("/settings/email?err=token_exchange");
  const tok = await tokenRes.json();

  const access_token = tok.access_token as string;
  const refresh_token = tok.refresh_token as string;
  const expires_in = (tok.expires_in ?? 3600) * 1000;
  const token_expires_at = new Date(Date.now() + expires_in).toISOString();

  // Get email address
  const meRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${access_token}` }
  });
  const me = await meRes.json();
  const email_address = me.email as string | undefined;

  // Save to Supabase
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect("/settings/email?err=not_signed_in");

  // upsert row
  const { error } = await supabase.from("user_connections").upsert({
    user_id: user.id,
    provider: "gmail",
    access_token,
    refresh_token: refresh_token ?? "",
    token_expires_at,
    email_address
  }, { onConflict: "user_id,provider" });

  if (error) return NextResponse.redirect("/settings/email?err=db");
  return NextResponse.redirect("/settings/email?ok=connected");
}
