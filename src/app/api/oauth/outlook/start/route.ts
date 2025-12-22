import { NextResponse } from "next/server";

function enc(o: Record<string, string>) {
  return Object.entries(o).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
}

export async function GET() {
  const p = {
    client_id: process.env.MS_CLIENT_ID!,
    response_type: "code",
    redirect_uri: process.env.MS_REDIRECT_URI!,
    response_mode: "query",
    scope: process.env.MS_SCOPES!,
  };
  return NextResponse.redirect(`https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${enc(p)}`);
}


