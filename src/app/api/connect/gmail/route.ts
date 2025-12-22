import { NextResponse } from "next/server";

export async function GET() {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: `${process.env.NEXT_PUBLIC_BASE_URL}/api/connect/gmail/callback`,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: [
      "openid","email","https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/gmail.send","https://www.googleapis.com/auth/userinfo.email"
    ].join(" "),
  });
  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}

