import { NextResponse } from "next/server";

export async function GET() {
  const params = new URLSearchParams({
    client_id: process.env.MS_CLIENT_ID!,
    response_type: "code",
    response_mode: "query",
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/outlook/callback`,
    scope: [
      "openid",
      "email",
      "profile",
      "offline_access",
      "Mail.Read",
      "Mail.Send"
    ].join(" ")
  });
  return NextResponse.redirect(`https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`);
}

