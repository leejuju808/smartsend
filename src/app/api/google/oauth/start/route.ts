import { NextResponse } from "next/server";

export async function GET() {
  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const redirectPath = process.env.NEXT_PUBLIC_GOOGLE_OAUTH_REDIRECT || "/api/google/oauth/callback";
  const redirectUri = new URL(redirectPath, process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").toString();
  const scope = process.env.NEXT_PUBLIC_GOOGLE_OAUTH_SCOPES ||
    "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send";

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope,
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
  });

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}
