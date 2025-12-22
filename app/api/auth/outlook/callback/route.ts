import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(new URL("/settings/sending-accounts?error=1", req.url));
  }

  const clientId = process.env.OUTLOOK_CLIENT_ID!;
  const clientSecret = process.env.OUTLOOK_CLIENT_SECRET!;
  const tenantId = process.env.OUTLOOK_TENANT_ID || "common";
  const redirectUri =
    process.env.OUTLOOK_REDIRECT_URI ??
    (process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/outlook/callback`
      : "https://app.smartsend.ai/api/auth/outlook/callback");

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL("/settings/sending-accounts?error=config", req.url));
  }

  try {
    // Exchange code for tokens
    const tokenRes = await fetch(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      }
    );

    if (!tokenRes.ok) {
      const errorText = await tokenRes.text();
      console.error("Outlook token exchange failed:", errorText);
      return NextResponse.redirect(new URL("/settings/sending-accounts?error=token", req.url));
    }

    const tokens = await tokenRes.json();

    // Get user profile
    const profileRes = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!profileRes.ok) {
      const errorText = await profileRes.text();
      console.error("Outlook profile fetch failed:", errorText);
      return NextResponse.redirect(new URL("/settings/sending-accounts?error=profile", req.url));
    }

    const profile = await profileRes.json();
    const fromEmail = profile.mail || profile.userPrincipalName;
    const fromName = profile.displayName || null;

    // Upsert sending account
    const { error } = await supabase
      .from("smartsend_sending_accounts")
      .upsert(
        {
          user_id: user.id,
          provider: "outlook",
          from_email: fromEmail,
          from_name: fromName,
          provider_account_id: profile.id || fromEmail,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: tokens.expires_in
            ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
            : null,
          status: "connected",
        },
        { onConflict: "user_id,from_email" }
      );

    if (error) {
      console.error("Error upserting sending account:", error);
      return NextResponse.redirect(new URL("/settings/sending-accounts?error=save", req.url));
    }

    return NextResponse.redirect(new URL("/settings/sending-accounts?connected=outlook", req.url));
  } catch (error) {
    console.error("Outlook OAuth error:", error);
    return NextResponse.redirect(new URL("/settings/sending-accounts?error=oauth", req.url));
  }
}
