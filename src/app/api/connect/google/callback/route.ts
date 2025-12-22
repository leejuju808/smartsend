import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens } from "@/lib/providers/google/oauth";
import { getServerSupabase } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  if (!code || !state) return NextResponse.redirect("/settings/email?error=oauth");

  const { wid } = JSON.parse(state);
  const tokens = await exchangeCodeForTokens({
    code,
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
    redirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI!
  });

  // fetch the connected Gmail address
  const meRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { Authorization: `Bearer ${tokens.access_token}` }
  });
  const me = await meRes.json(); // { emailAddress: string }

  const supabase = getServerSupabase();
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  // upsert connection for this workspace/user
  const { error } = await supabase.from("email_connections").upsert({
    workspace_id: wid,
    user_id: (await supabase.auth.getUser()).data.user?.id!,
    provider: "gmail",
    email_address: me.emailAddress,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    access_token_expires_at: expiresAt,
    status: "active"
  }, { onConflict: "workspace_id,provider" });

  if (error) return NextResponse.redirect("/settings/email?error=db");
  return NextResponse.redirect("/settings/email?connected=gmail");
}