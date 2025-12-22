import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const workspaceId = url.searchParams.get("workspace_id");

  if (!workspaceId) {
    return NextResponse.json({ error: "workspace_id is required" }, { status: 400 });
  }

  const clientId = process.env.MS_CLIENT_ID!;
  const redirectUri = new URL(
    "/api/calendar/outlook/callback",
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  ).toString();

  const scopes = [
    "https://graph.microsoft.com/Calendars.ReadWrite",
    "offline_access",
  ];

  const authUrl = new URL("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", scopes.join(" "));
  authUrl.searchParams.set("state", workspaceId);

  return NextResponse.redirect(authUrl.toString());
}








