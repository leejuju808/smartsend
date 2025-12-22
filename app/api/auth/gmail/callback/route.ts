import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
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

  const clientId = process.env.GMAIL_CLIENT_ID!;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET!;
  const redirectUri =
    process.env.GMAIL_REDIRECT_URI ??
    (process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/gmail/callback`
      : "https://app.smartsend.ai/api/auth/gmail/callback");

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL("/settings/sending-accounts?error=config", req.url));
  }

  const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  try {
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);

    // Get profile (email + name)
    const oauth2 = google.oauth2({ version: "v2", auth: oAuth2Client });
    const me = await oauth2.userinfo.get();
    const fromEmail = me.data.email!;
    const fromName = me.data.name || null;

    // Upsert sending account
    const { error } = await supabase
      .from("smartsend_sending_accounts")
      .upsert(
        {
          user_id: user.id,
          provider: "gmail",
          from_email: fromEmail,
          from_name: fromName,
          provider_account_id: me.data.id || fromEmail,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: tokens.expiry_date
            ? new Date(tokens.expiry_date).toISOString()
            : null,
          status: "connected",
        },
        { onConflict: "user_id,from_email" }
      );

    if (error) {
      console.error("Error upserting sending account:", error);
      return NextResponse.redirect(new URL("/settings/sending-accounts?error=save", req.url));
    }

    // Mark email as connected in onboarding
    await supabase
      .from("profiles")
      .update({ onboarding_email_connected: true })
      .eq("id", user.id);

    return NextResponse.redirect(new URL("/settings/sending-accounts?connected=gmail", req.url));
  } catch (error) {
    console.error("Gmail OAuth error:", error);
    return NextResponse.redirect(new URL("/settings/sending-accounts?error=oauth", req.url));
  }
}
