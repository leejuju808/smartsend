import { NextResponse } from "next/server";

export async function GET() {
  const clientId = process.env.OUTLOOK_CLIENT_ID;
  const configuredRedirect = process.env.OUTLOOK_REDIRECT_URI;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const redirectUri =
    configuredRedirect ??
    (appUrl ? `${appUrl}/api/auth/outlook/callback` : "https://app.smartsend.ai/api/auth/outlook/callback");

  if (!clientId || !redirectUri) {
    return NextResponse.json({ error: "outlook_oauth_not_configured" }, { status: 500 });
  }

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: "offline_access Mail.Send",
    prompt: "consent",
  });

  return NextResponse.redirect(
    `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`,
  );
}



