import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

// TODO: move to env
const GOOGLE_CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID!;
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_OAUTH_REDIRECT_URI!;
// e.g. "https://your-domain.com/api/email/connect/google/callback"
const GOOGLE_AUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
].join(" ");

export async function GET() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"));
  }

  // Get workspace_id from workspace_members
  const { data: membership, error: membershipError } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (membershipError || !membership) {
    return NextResponse.json({ error: "No workspace" }, { status: 400 });
  }

  const workspaceId = membership.workspace_id;

  // State can encode workspace + user to verify later
  const statePayload = Buffer.from(
    JSON.stringify({ w: workspaceId, u: user.id, p: "gmail" }),
    "utf8"
  ).toString("base64url");

  const url = new URL(GOOGLE_AUTH_BASE);
  url.searchParams.set("client_id", GOOGLE_CLIENT_ID);
  url.searchParams.set("redirect_uri", GOOGLE_REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_SCOPES);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", statePayload);

  return NextResponse.redirect(url.toString());
}










