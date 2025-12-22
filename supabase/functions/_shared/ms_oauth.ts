// deno-lint-ignore-file no-explicit-any

export type MsConn = {
  id: string;
  provider: "outlook" | string;
  email: string;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  tenant_id?: string | null;
  scope?: string | null;
  token_type?: string | null;
};

export async function msGetConn(sb: any, accountId: string): Promise<MsConn> {
  const { data, error } = await sb
    .from("connected_accounts")
    .select(
      "id,provider,email,access_token,refresh_token,expires_at,tenant_id,scope,token_type"
    )
    .eq("id", accountId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("connected account not found");
  return data as MsConn;
}

export function msExpiring(expires_at?: string | null, skewSec = 120): boolean {
  if (!expires_at) return true;
  return Date.now() > new Date(expires_at).getTime() - skewSec * 1000;
}

export async function msRefreshToken(sb: any, accountId: string): Promise<MsConn> {
  const conn = await msGetConn(sb, accountId);
  if (!conn.refresh_token) throw new Error("no refresh_token on account");

  const params = new URLSearchParams({
    client_id: Deno.env.get("MS_CLIENT_ID")!,
    client_secret: Deno.env.get("MS_CLIENT_SECRET")!,
    grant_type: "refresh_token",
    refresh_token: conn.refresh_token!,
    scope:
      Deno.env.get("MS_SCOPE") ??
      "https://graph.microsoft.com/.default offline_access",
  });

  const tenant = Deno.env.get("MS_TENANT") ?? "common";
  const res = await fetch(
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: params,
    }
  );
  if (!res.ok) throw new Error(`ms refresh failed: ${await res.text()}`);
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
  return data as MsConn;
}

export async function msEnsureAccessToken(
  sb: any,
  accountId: string
): Promise<string> {
  let c = await msGetConn(sb, accountId);
  if (msExpiring(c.expires_at)) {
    c = await msRefreshToken(sb, accountId);
  }
  if (!c.access_token) throw new Error("no access_token after refresh");
  return c.access_token;
}




