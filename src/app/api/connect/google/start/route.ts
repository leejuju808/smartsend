import { NextRequest, NextResponse } from "next/server";
import { googleAuthUrl } from "@/lib/providers/google/oauth";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";

export async function GET(req: NextRequest) {
  const gate = await requireWorkspace(req);
  if ("error" in gate) return gate.error;

  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI!;
  const state = JSON.stringify({ wid: gate.workspace_id });
  const url = googleAuthUrl({
    clientId: process.env.GOOGLE_OAUTH_CLIENT_ID!,
    redirectUri,
    state
  });
  return NextResponse.redirect(url);
}