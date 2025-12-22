import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  if (!code) return NextResponse.json({ error: "Missing code" }, { status: 400 });

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
      grant_type: "authorization_code",
      code,
    }),
  });
  const tok = await tokenRes.json();
  if (!tokenRes.ok) return NextResponse.json(tok, { status: 400 });

  const idinfo = JSON.parse(
    Buffer.from(tok.id_token.split(".")[1], "base64").toString("utf8")
  );
  const account_email = (idinfo?.email || "").toLowerCase();
  const provider_account_id = idinfo?.sub;

  const supabase = createRouteHandlerClient({ cookies });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("workspace_id")
    .eq("id", user.id)
    .single();
  const ws = profile?.workspace_id;

  const { data: row, error } = await supabase
    .from("email_accounts")
    .insert({
      workspace_id: ws,
      provider: "gmail",
      account_email,
      display_name: idinfo?.name ?? null,
      access_token: tok.access_token,
      expires_at: new Date(Date.now() + tok.expires_in * 1000).toISOString(),
      scope: tok.scope,
      provider_account_id,
      is_default: true,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.rpc("set_refresh_token", {
    _id: row.id,
    _plain: tok.refresh_token,
    _key: process.env.TOKEN_CRYPT_KEY!,
  });

  return NextResponse.redirect("/settings/email");
}


