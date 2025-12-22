import { createClient } from "jsr:@supabase/supabase-js";
import { isExpiredSoon } from "./provider-utils.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function updateTokens(id: string, values: { access_token?: string | null; expires_at?: string | null }) {
  const sb = createClient(SB_URL, SB_KEY);
  const { error } = await sb
    .from("connected_accounts")
    .update(values)
    .eq("id", id);
  if (error) {
    throw new Error(`failed to persist refreshed tokens: ${error.message}`);
  }
}

export async function ensureGmailAccess(conn: any) {
  if (conn.provider !== "gmail") return conn;
  if (conn.access_token && !isExpiredSoon(conn.expires_at)) return conn;
  if (!conn.refresh_token) throw new Error("Gmail refresh_token missing");

  const params = new URLSearchParams({
    client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
    client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
    grant_type: "refresh_token",
    refresh_token: conn.refresh_token,
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  if (!res.ok) {
    throw new Error(`Gmail refresh failed: ${await res.text()}`);
  }
  const j = await res.json();

  const expires_at = new Date(Date.now() + ((j.expires_in ?? 3600) as number) * 1000).toISOString();
  await updateTokens(conn.id, { access_token: j.access_token as string, expires_at });

  return { ...conn, access_token: j.access_token, expires_at };
}

export async function ensureOutlookAccess(conn: any) {
  if (conn.provider !== "outlook") return conn;
  if (conn.access_token && !isExpiredSoon(conn.expires_at)) return conn;
  if (!conn.refresh_token) throw new Error("Outlook refresh_token missing");

  const params = new URLSearchParams({
    client_id: Deno.env.get("MS_CLIENT_ID")!,
    client_secret: Deno.env.get("MS_CLIENT_SECRET")!,
    grant_type: "refresh_token",
    refresh_token: conn.refresh_token,
    scope: "https://graph.microsoft.com/.default offline_access",
  });

  const res = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  if (!res.ok) {
    throw new Error(`Outlook refresh failed: ${await res.text()}`);
  }
  const j = await res.json();

  const expires_at = new Date(Date.now() + ((j.expires_in ?? 3600) as number) * 1000).toISOString();
  await updateTokens(conn.id, { access_token: j.access_token as string, expires_at });

  return { ...conn, access_token: j.access_token, expires_at };
}











