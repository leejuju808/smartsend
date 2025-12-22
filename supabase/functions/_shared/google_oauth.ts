// supabase/functions/_shared/google_oauth.ts
// deno-lint-ignore-file no-explicit-any
export type Conn = {
  id: string;
  provider: "gmail" | string;
  email: string;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null; // ISO
  token_type?: string | null;
  scope?: string | null;
};

export async function getConnection(sb: any, accountId: string): Promise<Conn> {
  const { data, error } = await sb
    .from("connected_accounts")
    .select("id,provider,email,access_token,refresh_token,expires_at,token_type,scope")
    .eq("id", accountId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("connected account not found");
  return data as Conn;
}

export function isExpiring(expires_at?: string | null, skewSec = 120): boolean {
  if (!expires_at) return true;
  const exp = new Date(expires_at).getTime();
  return Date.now() > exp - skewSec * 1000;
}

export async function refreshGoogleToken(sb: any, accountId: string): Promise<Conn> {
  const conn = await getConnection(sb, accountId);
  if (!conn.refresh_token) throw new Error("no refresh_token on account");

  const body = new URLSearchParams({
    client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
    client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
    refresh_token: conn.refresh_token!,
    grant_type: "refresh_token",
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`google refresh failed: ${await res.text()}`);
  const j = await res.json();

  const expiresAt = new Date(Date.now() + (j.expires_in ?? 3600) * 1000).toISOString();

  const { data, error } = await sb
    .from("connected_accounts")
    .update({
      access_token: j.access_token,
      token_type: j.token_type ?? "Bearer",
      expires_at: expiresAt,
      scope: j.scope ?? conn.scope,
      id_token: j.id_token ?? null,
    })
    .eq("id", accountId)
    .select()
    .maybeSingle();
  if (error) throw error;
  return data as Conn;
}

export async function ensureGoogleAccessToken(sb: any, accountId: string): Promise<string> {
  let c = await getConnection(sb, accountId);
  if (isExpiring(c.expires_at)) {
    c = await refreshGoogleToken(sb, accountId);
  }
  if (!c.access_token) throw new Error("no access_token after refresh");
  return c.access_token;
}

