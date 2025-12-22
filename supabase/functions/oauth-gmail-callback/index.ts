// supabase/functions/oauth-gmail-callback/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
const CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
const REDIRECT_URI = Deno.env.get("GOOGLE_REDIRECT_URI")!; // e.g. https://<proj>.functions.supabase.co/oauth-gmail-callback

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state"); // encode user_id + workspace_id
    if (!code || !state) throw new Error("Missing code/state");

    const { user_id, workspace_id } = JSON.parse(decodeURIComponent(state));

    const params = new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
      access_type: "offline",
    });

    const tokenRes = await fetch(GOOGLE_TOKEN_URL, { method: "POST", body: params });
    if (!tokenRes.ok) throw new Error(await tokenRes.text());
    const tokens = await tokenRes.json(); // { access_token, refresh_token, expires_in, ... }

    // Get account email
    const me = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = await me.json(); // { email, ... }

    const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();

    await supabase.from("user_email_providers").upsert({
      user_id,
      workspace_id,
      provider: "gmail",
      email: profile.email,
      refresh_token: tokens.refresh_token,
      access_token: tokens.access_token,
      access_token_expires_at: expiresAt,
    }, { onConflict: "user_id,provider,email" });

    // Redirect back to your app
    const appURL = Deno.env.get("APP_URL") ?? "https://smartsend.ai";
    return Response.redirect(`${appURL}/connections?connected=gmail`, 302);
  } catch (e) {
    return new Response(`OAuth error: ${e}`, { status: 400 });
  }
});