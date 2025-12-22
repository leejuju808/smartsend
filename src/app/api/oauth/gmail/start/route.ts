import { NextResponse } from "next/server";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "openid",
  "email",
  "profile",
].join(" ");

export async function GET() {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
  });
  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  );
}


