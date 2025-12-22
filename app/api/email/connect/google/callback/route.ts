import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET!;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_OAUTH_REDIRECT_URI!;

export async function GET(req: NextRequest) {
  const supabase = createClient();

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    console.error("Google OAuth error:", error);
    return NextResponse.redirect("/onboarding/connect-email?error=google_oauth");
  }

  if (!code || !state) {
    return NextResponse.redirect("/onboarding/connect-email?error=missing_code");
  }

  let decoded: { w: string; u: string; p: string };

  try {
    decoded = JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
  } catch {
    return NextResponse.redirect("/onboarding/connect-email?error=bad_state");
  }

  try {
    // Exchange code for tokens
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenRes.ok) {
      console.error("Token exchange failed", await tokenRes.text());
      return NextResponse.redirect("/onboarding/connect-email?error=token_exchange");
    }

    const tokenJson = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      token_type?: string;
    };

    // Fetch user info
    const userInfoRes = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });

    if (!userInfoRes.ok) {
      console.error("Userinfo failed", await userInfoRes.text());
      return NextResponse.redirect("/onboarding/connect-email?error=userinfo");
    }

    const userInfo = (await userInfoRes.json()) as {
      email: string;
      name?: string;
    };

    const expiresAt = tokenJson.expires_in
      ? new Date(Date.now() + tokenJson.expires_in * 1000).toISOString()
      : null;

    // Upsert email account (without refresh_token - we'll set it separately with encryption)
    const { data: account, error: upsertError } = await supabase
      .from("email_accounts")
      .upsert(
        {
          workspace_id: decoded.w,
          user_id: decoded.u,
          provider: "gmail",
          email: userInfo.email,
          account_email: userInfo.email, // Keep for compatibility
          display_name: userInfo.name ?? userInfo.email,
          access_token: tokenJson.access_token,
          expires_at: expiresAt,
          scope: tokenJson.scope ?? null,
          status: "connected",
        },
        {
          onConflict: "workspace_id,email",
        }
      )
      .select("id")
      .single();

    if (upsertError || !account) {
      console.error(upsertError);
      return NextResponse.redirect("/onboarding/connect-email?error=save_failed");
    }

    // Set refresh_token using encryption function if available
    if (tokenJson.refresh_token && process.env.TOKEN_CRYPT_KEY) {
      const { error: tokenError } = await supabase.rpc("set_refresh_token", {
        _id: account.id,
        _plain: tokenJson.refresh_token,
        _key: process.env.TOKEN_CRYPT_KEY,
      });

      if (tokenError) {
        console.error("Failed to encrypt refresh token:", tokenError);
        // Non-fatal, continue
      }
    }

    // OPTIONAL: if this is first account, you could auto-set onboarding_step -> first_upload here
    // but we'll centralize that in a dedicated endpoint.

    return NextResponse.redirect("/onboarding/connect-email?connected=gmail");
  } catch (e) {
    console.error(e);
    return NextResponse.redirect("/onboarding/connect-email?error=server");
  }
}

