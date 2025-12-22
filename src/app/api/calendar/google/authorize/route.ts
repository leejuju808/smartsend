import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const workspaceId = url.searchParams.get("workspace_id");

  if (!workspaceId) {
    return NextResponse.json({ error: "workspace_id is required" }, { status: 400 });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID!;
  const redirectUri = new URL(
    "/api/calendar/google/callback",
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  ).toString();

  const scopes = [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/calendar.events",
  ];

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", scopes.join(" "));
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent"); // Force consent to get refresh token
  authUrl.searchParams.set("state", workspaceId);

  return NextResponse.redirect(authUrl.toString());
}








