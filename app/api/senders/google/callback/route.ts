import { NextResponse } from "next/server";
import { exchangeCodeForTokens } from "@/lib/googleOauth";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

async function fetchProfile(accessToken: string) {
  const res = await fetch("https://www.googleapis.com/gmail/v1/users/me/profile", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`profile fetch failed: ${await res.text()}`);
  return res.json() as Promise<{ emailAddress: string }>;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (!code) return NextResponse.json({ error: "missing code" }, { status: 400 });

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  try {
    const tokens = await exchangeCodeForTokens(code);
    const expiresAt = new Date(Date.now() + (tokens.expires_in - 60) * 1000);
    const profile = await fetchProfile(tokens.access_token);

    // TODO: resolve workspace_id from session/auth
    const workspace_id = "00000000-0000-0000-0000-000000000000";

    const { error } = await supabase.from("sender_accounts").upsert(
      {
        workspace_id,
        provider: "gmail",
        email: profile.emailAddress.toLowerCase(),
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token ?? "",
        expires_at: expiresAt.toISOString(),
        scope: tokens.scope,
        label: `Gmail (${profile.emailAddress})`,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id,provider,email" }
    );

    if (error) throw new Error(error.message);

    return NextResponse.redirect(`${process.env.APP_BASE_URL}/settings/senders?connected=gmail`);
  } catch (e: any) {
    return NextResponse.redirect(`${process.env.APP_BASE_URL}/settings/senders?error=${encodeURIComponent(e.message)}`);
  }
}


