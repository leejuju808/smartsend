import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: acct } = await supabase
    .from("email_accounts")
    .select("access_token, refresh_token, token_expires_at")
    .eq("user_id", user.id)
    .eq("provider", "gmail")
    .maybeSingle();
  if (!acct) return NextResponse.json({ error: "No Gmail account" }, { status: 400 });

  // refresh if needed (same as above)
  let accessToken = acct.access_token as string | null;
  const needsRefresh = !accessToken || !acct.token_expires_at || new Date(acct.token_expires_at) < new Date(Date.now() + 60_000);
  if (needsRefresh) {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: acct.refresh_token as string,
        grant_type: "refresh_token",
      }),
    });
    if (!res.ok) return NextResponse.json({ error: "Token refresh failed" }, { status: 500 });
    const json = await res.json();
    accessToken = json.access_token;
    const expiryIso = new Date(Date.now() + json.expires_in * 1000).toISOString();
    await supabase
      .from("email_accounts")
      .update({ access_token: accessToken, token_expires_at: expiryIso })
      .eq("user_id", user.id)
      .eq("provider", "gmail");
  }

  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Message-ID&metadataHeaders=Date`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!res.ok) return NextResponse.json({ error: "Gmail fetch failed" }, { status: 500 });
  const thread = await res.json();
  return NextResponse.json(thread);
}

