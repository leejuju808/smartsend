import { cookies } from "next/headers";
import { createServerClient } from "@supabase/auth-helpers-nextjs";

export async function ensureOutlookToken() {
  const s = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: () => cookies() });
  const { data: { user } } = await s.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { data: conn } = await s.from("user_connections").select("*").eq("user_id", user.id).eq("provider", "outlook").maybeSingle();
  if (!conn) throw new Error("No Outlook connection");

  if (new Date(conn.token_expires_at).getTime() > Date.now() + 60_000) return conn.access_token as string;

  const body = new URLSearchParams({
    client_id: process.env.MS_CLIENT_ID!,
    client_secret: process.env.MS_CLIENT_SECRET!,
    grant_type: "refresh_token",
    refresh_token: conn.refresh_token!
  });
  const r = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", { method: "POST", body });
  if (!r.ok) throw new Error("Outlook refresh failed");
  const j = await r.json();
  const access = j.access_token as string;
  const exp = new Date(Date.now() + (j.expires_in ?? 3600) * 1000).toISOString();
  await s.from("user_connections").update({ access_token: access, token_expires_at: exp }).eq("id", conn.id);
  return access;
}

