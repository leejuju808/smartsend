import { NextResponse } from "next/server";
import { google } from "googleapis";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const state = url.searchParams.get("state"); // workspace_id or other state

  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_OAUTH_CLIENT_SECRET!;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || process.env.GOOGLE_OAUTH_REDIRECT_URI!;

  const oauth2 = new google.auth.OAuth2(
    clientId,
    clientSecret,
    redirectUri
  );

  const authUrl = oauth2.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.modify",
    ],
    state: state || undefined, // Pass workspace_id or other state
  });

  return NextResponse.redirect(authUrl);
}

