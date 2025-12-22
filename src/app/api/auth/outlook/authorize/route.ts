import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const params = new URLSearchParams({
    client_id: process.env.MS_CLIENT_ID!,
    response_type: "code",
    redirect_uri: process.env.MS_REDIRECT_URI!,
    response_mode: "query",
    scope: [
      "offline_access",
      "Mail.Read",
      "Mail.Send",
      "Mail.ReadWrite"
    ].join(" "),
  });
  return NextResponse.redirect(
    `https://login.microsoftonline.com/${process.env.MS_TENANT_ID!}/oauth2/v2.0/authorize?${params.toString()}`
  );
}

