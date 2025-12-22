import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  
  if (!code) {
    return NextResponse.redirect("/settings/email?error=missing_code");
  }

  try {
    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_OAUTH_CLIENT_SECRET!,
        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/oauth/provider-accounts/callback`,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      return NextResponse.redirect("/settings/email?error=token_exchange_failed");
    }

    const tokens = await tokenRes.json();
    const access_token = tokens.access_token as string;
    const refresh_token = (tokens.refresh_token as string) || null;
    const expires_in = (tokens.expires_in as number) ?? 3600;

    // Get the user's Gmail address
    const profileRes = await fetch("https://www.googleapis.com/gmail/v1/users/me/profile", {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    
    if (!profileRes.ok) {
      return NextResponse.redirect("/settings/email?error=gmail_profile_failed");
    }
    
    const profile = await profileRes.json();
    const emailAddress = profile.emailAddress as string;

    // Get the authenticated user from Supabase
    // Note: We need to get user_id from session/cookie or pass it via state
    // For now, we'll use service role to insert - but we need user_id
    // Let's use a session-based approach
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Parse state to get redirect URL
    const stateData = state ? JSON.parse(state) : {};
    const redirectUrl = stateData.redirect || "/settings/email";

    // We need the user_id - this should come from the session
    // For now, we'll redirect to a page that handles this with client-side code
    // Or we can use cookies/headers to get user_id
    // Let's create a temporary route that stores tokens and then redirects
    
    // Store tokens temporarily (or better: pass user_id via state)
    // For MVP, let's use a client-side component to complete the connection
    return NextResponse.redirect(
      `/settings/email/complete?access_token=${encodeURIComponent(access_token)}&refresh_token=${encodeURIComponent(refresh_token || "")}&expires_in=${expires_in}&email=${encodeURIComponent(emailAddress)}`
    );
  } catch (e) {
    console.error("OAuth callback error:", e);
    return NextResponse.redirect("/settings/email?error=oauth_failed");
  }
}

