import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function ensureGmailToken() {
  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { data: conn } = await supabase
    .from("user_connections")
    .select("*")
    .eq("user_id", user.id).eq("provider","gmail").single();

  if (!conn) throw new Error("No Gmail connection");

  const exp = new Date(conn.token_expires_at).getTime();
  if (Date.now() < exp - 60_000) return conn.access_token as string;

  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    refresh_token: conn.refresh_token!,
    grant_type: "refresh_token"
  });

  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body });
  if (!r.ok) throw new Error("Refresh failed");
  const data = await r.json();
  const access = data.access_token as string;
  const newExp = new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString();
  await supabase.from("user_connections").update({ access_token: access, token_expires_at: newExp }).eq("id", conn.id);
  return access;
}
