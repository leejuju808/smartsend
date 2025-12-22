import { NextResponse } from "next/server";

function urlEncode(obj: Record<string, string>) {
  return Object.entries(obj)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
}

export async function GET() {
  const params = {
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    scope: process.env.GOOGLE_SCOPES!,
  };
  const url = `https://accounts.google.com/o/oauth2/v2/auth?${urlEncode(params)}`;
  return NextResponse.redirect(url);
}
