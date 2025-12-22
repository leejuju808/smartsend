import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const clientId = process.env.GMAIL_CLIENT_ID!;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET!;
  const redirectUri =
    process.env.GMAIL_REDIRECT_URI ??
    (process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/gmail/callback`
      : "https://app.smartsend.ai/api/auth/gmail/callback");

  if (!clientId || !clientSecret) {
    return NextResponse.json({ error: "Gmail OAuth not configured" }, { status: 500 });
  }

  const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: "offline",
    scope: [
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
      "openid",
    ],
    prompt: "consent",
  });

  return NextResponse.json({ url: authUrl });
}


































































