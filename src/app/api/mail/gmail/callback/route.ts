import { NextResponse } from "next/server";
import { google } from "googleapis";
import { supabaseAdmin } from "@/server/supabase";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (!code) return NextResponse.json({ error: "Missing code" }, { status: 400 });
  const state = url.searchParams.get("state");
  let userId = url.searchParams.get("userId");
  try {
    if (!userId && state) userId = JSON.parse(state).userId;
  } catch {}
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    process.env.GOOGLE_OAUTH_REDIRECT_URL!
  );

  const { tokens } = await oauth2.getToken(code);
  oauth2.setCredentials(tokens);

  const oauth2api = google.oauth2({ version: "v2", auth: oauth2 });
  const prof = await oauth2api.userinfo.get();
  const from_email = prof.data.email as string;

  await supabaseAdmin.from("mailboxes").upsert(
    {
      owner: userId,
      provider: "gmail",
      from_email,
      from_name: null,
      gmail_refresh_token: tokens.refresh_token || null,
      gmail_access_token: tokens.access_token || null,
      gmail_token_expiry: tokens.expiry_date
        ? new Date(tokens.expiry_date).toISOString()
        : null,
      verified: false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "owner" }
  );

  return NextResponse.redirect(
    `${process.env.NEXT_PUBLIC_SITE_URL}/settings/mailbox?connected=gmail`
  );
}

