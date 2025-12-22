// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type Provider = "gmail" | "outlook";

export type ConnectedAccount = {
  id: string;
  user_id?: string | null;
  provider: Provider;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  email: string | null;
  cooldown_until: string | null;
  meta: any;
};

export type Conn = ConnectedAccount;

const SUPABASE_URL = requireEnv([
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_URL",
  "PUBLIC_SUPABASE_URL",
]);
const SERVICE_KEY = requireEnv(["SUPABASE_SERVICE_ROLE_KEY", "SERVICE_ROLE_KEY"]);
const GOOGLE_CLIENT_ID = requireEnv(["GOOGLE_CLIENT_ID", "GMAIL_CLIENT_ID"]);
const GOOGLE_CLIENT_SECRET = requireEnv(["GOOGLE_CLIENT_SECRET", "GMAIL_CLIENT_SECRET"]);
const MS_CLIENT_ID = requireEnv(["MS_CLIENT_ID", "OUTLOOK_CLIENT_ID"]);
const MS_CLIENT_SECRET = requireEnv(["MS_CLIENT_SECRET", "OUTLOOK_CLIENT_SECRET"]);
const MS_TENANT = Deno.env.get("MS_TENANT") || Deno.env.get("OUTLOOK_TENANT") || "common";

export function sbAdmin() {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

export const makeSb = sbAdmin;

const sharedSb = sbAdmin();

export function requireEnv(keys: string[], label?: string): string {
  for (const key of keys) {
    const value = Deno.env.get(key);
    if (value) return value;
  }
  throw new Error(label ? `Missing env for ${label}: ${keys.join(" or ")}` : `Missing env: ${keys.join(" or ")}`);
}

export function assertProvider(provider: string): Provider {
  if (provider === "gmail" || provider === "outlook") return provider;
  throw new Error(`Unsupported provider: ${provider}`);
}

export async function loadAccount(ref: { id?: string; email?: string; provider?: Provider }): Promise<ConnectedAccount> {
  const sb = sbAdmin();
  let query = sb.from("connected_accounts").select("*").limit(1);
  if (ref.id) {
    query = query.eq("id", ref.id);
  } else if (ref.email && ref.provider) {
    query = query.eq("email", ref.email).eq("provider", ref.provider);
  } else {
    throw new Error("loadAccount: need id or (email+provider)");
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Account not found");

  return normalizeAccount(data);
}

function normalizeAccount(data: Record<string, any>): ConnectedAccount {
  return {
    id: data.id,
    user_id: data.user_id ?? null,
    provider: assertProvider(data.provider),
    access_token: data.access_token ?? null,
    refresh_token: data.refresh_token ?? null,
    expires_at: data.expires_at ?? null,
    email: data.email ?? null,
    cooldown_until: data.cooldown_until ?? null,
    meta: data.meta ?? null,
  };
}

export async function ensureFreshToken(account: Conn): Promise<Conn> {
  return refreshIfNeeded(account);
}

export async function getAccessToken(account_id: string) {
  const sb = sbAdmin();
  const { data, error } = await sb
    .from("connected_accounts")
    .select("id, provider, access_token, refresh_token, expires_at, email, meta, cooldown_until")
    .eq("id", account_id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Account not found");

  const account = normalizeAccount(data);
  const fresh = await refreshIfNeeded(account);
  if (!fresh.access_token) throw new Error("Missing access token");

  return { provider: fresh.provider, access_token: fresh.access_token };
}

async function refreshIfNeeded(acc: ConnectedAccount, force = false): Promise<ConnectedAccount> {
  const now = Date.now();
  const exp = acc.expires_at ? new Date(acc.expires_at).getTime() : 0;
  const nearExpiry = now > exp - 5 * 60 * 1000;
  if (!force && acc.access_token && !nearExpiry) return acc;

  if (!acc.refresh_token) throw new Error("No refresh_token");

  if (acc.provider === "gmail") {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        grant_type: "refresh_token",
        refresh_token: acc.refresh_token,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error_description ?? json.error ?? "Google refresh failed");

    const access_token = json.access_token as string;
    const expires_at = new Date(Date.now() + (Number(json.expires_in) || 3600) * 1000).toISOString();

    const { data, error } = await sharedSb
      .from("connected_accounts")
      .update({ access_token, expires_at, cooldown_until: null })
      .eq("id", acc.id)
      .select("*")
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) throw new Error("Refresh update failed");
    return normalizeAccount(data);
  }

  const res = await fetch(`https://login.microsoftonline.com/${MS_TENANT}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: MS_CLIENT_ID,
      client_secret: MS_CLIENT_SECRET,
      grant_type: "refresh_token",
      refresh_token: acc.refresh_token,
      scope: "offline_access https://graph.microsoft.com/.default",
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error_description ?? JSON.stringify(json) ?? "Microsoft refresh failed");

  const access_token = json.access_token as string;
  const expires_at = new Date(Date.now() + (Number(json.expires_in) || 3600) * 1000).toISOString();

  const { data, error } = await sharedSb
    .from("connected_accounts")
    .update({ access_token, expires_at, cooldown_until: null })
    .eq("id", acc.id)
    .select("*")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Refresh update failed");
  return normalizeAccount(data);
}

async function rateGuard(acc: ConnectedAccount) {
  if (!acc.cooldown_until) return;
  const cutoff = new Date(acc.cooldown_until).getTime();
  if (Number.isNaN(cutoff)) return;
  if (cutoff > Date.now()) {
    throw new Error(`Rate-limited until ${acc.cooldown_until}`);
  }
}

export async function providerFetch(
  account: ConnectedAccount,
  req: Request | { url: string; init?: RequestInit },
  opts?: { bump?: boolean },
): Promise<Response> {
  await rateGuard(account);

  let url: string;
  let init: RequestInit;
  if (req instanceof Request) {
    url = req.url;
    init = {
      method: req.method,
      headers: req.headers,
      body: req.body as any,
    };
  } else {
    url = req.url;
    init = req.init ?? {};
  }

  init.headers = new Headers(init.headers ?? {});
  init.headers.set("authorization", `Bearer ${account.access_token}`);

  let response = await fetch(url, init);
  if (response.status === 401) {
    const refreshed = await refreshIfNeeded(account, true);
    init.headers.set("authorization", `Bearer ${refreshed.access_token}`);
    response = await fetch(url, init);
    account = refreshed;
  }

  const err = response.status >= 400;
  const sb = sbAdmin();

  if (response.status === 429) {
    const until = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    await sb.from("connected_accounts").update({ cooldown_until: until }).eq("id", account.id);
  }

  if (opts?.bump ?? true) {
    await sb.rpc("bump_provider_calls", {
      p_account: account.id,
      p_provider: account.provider,
      p_err: err,
    });
  }

  return response;
}

export function gmail(url: string) {
  return url;
}

export function graph(url: string) {
  return url;
}

export async function gmailFetchBy(ref: { id?: string; email?: string }, url: string, init?: RequestInit) {
  const account = await loadAccount({ ...ref, provider: "gmail" });
  const refreshed = await refreshIfNeeded(account);
  return providerFetch(refreshed, { url: gmail(url), init });
}

export async function outlookFetchBy(ref: { id?: string; email?: string }, url: string, init?: RequestInit) {
  const account = await loadAccount({ ...ref, provider: "outlook" });
  const refreshed = await refreshIfNeeded(account);
  return providerFetch(refreshed, { url: graph(url), init });
}

export async function bumpCalls(account: ConnectedAccount, err: boolean) {
  const sb = sbAdmin();
  await sb.rpc("bump_provider_calls", {
    p_account: account.id,
    p_provider: account.provider,
    p_err: err,
  });
}

