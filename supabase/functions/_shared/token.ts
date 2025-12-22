// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type Mailbox = {
  id: string; team_id: string; user_id: string; provider: "gmail"|"outlook";
  email: string; access_token: string|null; refresh_token: string|null;
  token_expires_at: string|null; gmail_history_id: string|null; outlook_delta_link: string|null;
  gmail_watch_expire_at: string|null;
};

export function sbAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

export function isExpired(ts?: string|null, skewSec=60) {
  if (!ts) return true;
  const exp = new Date(ts).getTime() - skewSec*1000;
  return Date.now() >= exp;
}

export async function getMailbox(mailboxId: string) {
  const sb = sbAdmin();
  const { data, error } = await sb.from("mailboxes").select("*").eq("id", mailboxId).single();
  if (error || !data) throw new Error("Mailbox not found");
  return data as Mailbox;
}

export async function saveMailbox(m: Partial<Mailbox> & { id: string }) {
  const sb = sbAdmin();
  const { error } = await sb.from("mailboxes").update(m).eq("id", m.id);
  if (error) throw new Error(error.message);
}

export async function ensureGmailAccess(m: Mailbox) {
  if (m.provider !== "gmail") throw new Error("Not Gmail mailbox");
  if (!isExpired(m.token_expires_at)) return m.access_token!;
  if (!m.refresh_token) throw new Error("Missing refresh_token");

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type":"application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
      refresh_token: m.refresh_token!,
      grant_type: "refresh_token"
    })
  });
  const j = await resp.json();
  if (!resp.ok) throw new Error("Google token refresh failed: " + JSON.stringify(j));
  const access = j.access_token as string;
  const expiresIn = j.expires_in as number;
  const expAt = new Date(Date.now()+expiresIn*1000).toISOString();
  await saveMailbox({ id: m.id, access_token: access, token_expires_at: expAt });
  return access;
}

export async function ensureGraphAccess(m: Mailbox) {
  if (m.provider !== "outlook") throw new Error("Not Outlook mailbox");
  if (!isExpired(m.token_expires_at)) return m.access_token!;
  if (!m.refresh_token) throw new Error("Missing refresh_token");

  const tenant = Deno.env.get("MS_TENANT_ID")!;
  const resp = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method:"POST",
    headers: { "Content-Type":"application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("MS_CLIENT_ID")!,
      client_secret: Deno.env.get("MS_CLIENT_SECRET")!,
      refresh_token: m.refresh_token!,
      grant_type: "refresh_token",
      scope: "https://graph.microsoft.com/.default offline_access"
    })
  });
  const j = await resp.json();
  if (!resp.ok) throw new Error("MS token refresh failed: " + JSON.stringify(j));
  const access = j.access_token as string;
  const expiresIn = j.expires_in as number;
  const expAt = new Date(Date.now()+expiresIn*1000).toISOString();
  await saveMailbox({ id: m.id, access_token: access, token_expires_at: expAt });
  return access;
}

