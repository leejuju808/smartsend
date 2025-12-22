import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

// TODO: move to env
const MS_CLIENT_ID = process.env.MS_CLIENT_ID || process.env.OUTLOOK_CLIENT_ID!;
const MS_REDIRECT_URI = process.env.MS_REDIRECT_URI || process.env.OUTLOOK_REDIRECT_URI!;
const MS_TENANT_ID = process.env.MS_TENANT_ID || "common";
const MS_AUTH_BASE = `https://login.microsoftonline.com/${MS_TENANT_ID}/oauth2/v2.0/authorize`;

// Microsoft Graph scopes for sending email and reading profile
const MS_SCOPES = [
  "https://graph.microsoft.com/Mail.Send",
  "https://graph.microsoft.com/User.Read",
  "offline_access",
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
    JSON.stringify({ w: workspaceId, u: user.id, p: "outlook" }),
    "utf8"
  ).toString("base64url");

  const url = new URL(MS_AUTH_BASE);
  url.searchParams.set("client_id", MS_CLIENT_ID);
  url.searchParams.set("redirect_uri", MS_REDIRECT_URI);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", MS_SCOPES);
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("state", statePayload);

  return NextResponse.redirect(url.toString());
}










