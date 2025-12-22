import { NextResponse } from "next/server";

export async function GET() {
  const clientId = process.env.MICROSOFT_CLIENT_ID ?? process.env.MS_CLIENT_ID;
  const redirectUri =
    process.env.NEXT_PUBLIC_APP_URL && process.env.NEXT_PUBLIC_APP_URL.length > 0
      ? `${process.env.NEXT_PUBLIC_APP_URL}/api/oauth/microsoft/callback`
      : process.env.MICROSOFT_REDIRECT_URI ?? process.env.MS_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: "microsoft_oauth_not_configured" },
      { status: 500 }
    );
  }

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: ["offline_access", "Mail.Read", "User.Read"].join(" "),
  });

  return NextResponse.redirect(
    `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`
  );
}







