import { cookies } from "next/headers";
import { NextRequest } from "next/server";

const GMAIL_SCOPE = encodeURIComponent("https://www.googleapis.com/auth/gmail.send");

export async function GET(_req: NextRequest) {
  const clientId =
    process.env.GOOGLE_OAUTH_CLIENT_ID ?? process.env.GOOGLE_CLIENT_ID;
  const redirectUrl =
    process.env.GOOGLE_OAUTH_REDIRECT_URL ??
    process.env.GOOGLE_OAUTH_REDIRECT_URI ??
    process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !redirectUrl) {
    return new Response("Gmail OAuth not configured", { status: 500 });
  }

  const state = crypto.randomUUID();
  const cookieStore = cookies();
  cookieStore.set("oauth_gmail_state", state, {
    httpOnly: true,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 10 * 60,
  });

  const url =
    `https://accounts.google.com/o/oauth2/v2/auth?response_type=code` +
    `&client_id=${clientId}` +
    `&redirect_uri=${encodeURIComponent(redirectUrl)}` +
    `&scope=${GMAIL_SCOPE}` +
    `&access_type=offline&prompt=consent&state=${state}`;

  return Response.redirect(url);
}

