import { NextResponse } from "next/server";

export async function GET() {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const configuredRedirect = process.env.GMAIL_REDIRECT_URI;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const redirectUri =
    configuredRedirect ??
    (appUrl ? `${appUrl}/api/auth/gmail/callback` : "https://app.smartsend.ai/api/auth/gmail/callback");

  if (!clientId || !redirectUri) {
    return NextResponse.json({ error: "gmail_oauth_not_configured" }, { status: 500 });
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: "https://www.googleapis.com/auth/gmail.send"
  });

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}

