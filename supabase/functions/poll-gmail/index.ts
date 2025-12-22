// Deno deploy function: polls Gmail for each connected account and upserts into public.emails
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;

// --- helpers
async function sb<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!r.ok) throw new Error(`${path} ${r.status} ${await r.text()}`);
  return r.json();
}

type ProviderAccount = {
  id: string;
  user_id: string;
  provider: "gmail";
  email_address: string;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: number | null;
};

async function listProviderAccounts(): Promise<ProviderAccount[]> {
  const qs = new URLSearchParams({ select: "*", provider: "eq.gmail" });
  return sb<ProviderAccount[]>(`/rest/v1/provider_accounts?${qs.toString()}`);
}

async function refreshGoogleToken(refresh_token: string) {
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
    }),
  });
  if (!resp.ok) throw new Error(`refresh fail: ${await resp.text()}`);
  return resp.json() as Promise<{ access_token: string; expires_in: number }>;
}

function base64UrlDecode(input: string): string {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const text = atob(b64 + pad);
  return new TextDecoder().decode(Uint8Array.from(text, (c) => c.charCodeAt(0)));
}

type GmailMsg = {
  id: string;
  threadId: string;
  payload?: {
    mimeType?: string;
    body?: { data?: string };
    parts?: any[];
    headers?: { name: string; value: string }[];
  };
  snippet?: string;
  internalDate?: string;
};

function header(headers: { name: string; value: string }[] | undefined, key: string): string | null {
  const h = headers?.find((h) => h.name.toLowerCase() === key.toLowerCase());
  return h?.value ?? null;
}

function extractPlainText(payload: any): string {
  if (!payload) return "";
  if (payload.body?.data) return base64UrlDecode(payload.body.data);
  if (payload.parts && Array.isArray(payload.parts)) {
    for (const p of payload.parts) {
      if (p.mimeType?.startsWith("text/plain") && p.body?.data) {
        return base64UrlDecode(p.body.data);
      }
    }
    // fallback to first part recursively
    return extractPlainText(payload.parts[0]);
  }
  return "";
}

async function gmailList(accessToken: string, q: string): Promise<{ messages?: { id: string }[] }> {
  const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?${new URLSearchParams({ q })}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (r.status === 404) return {};
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function gmailGet(accessToken: string, id: string): Promise<GmailMsg> {
  const r = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function upsertEmail(row: {
  user_id: string;
  provider: "gmail";
  provider_message_id: string;
  provider_thread_id: string;
  from_email: string | null;
  subject: string | null;
  preview: string | null;
  body: string | null;
  created_at: string | null;
}) {
  const payload = [row];
  // Use column names for conflict resolution (matches unique index)
  const res = await fetch(`${SUPABASE_URL}/rest/v1/emails?on_conflict=user_id,provider,provider_message_id`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SERVICE_ROLE}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`upsert fail: ${await res.text()}`);
}

async function pollAccount(acct: ProviderAccount) {
  // ensure access token
  let access = acct.access_token || "";
  const exp = acct.expires_at ? Number(acct.expires_at) : 0;
  if (!access || Date.now() / 1000 > exp - 60) {
    if (!acct.refresh_token) throw new Error("missing refresh_token");
    const ref = await refreshGoogleToken(acct.refresh_token);
    access = ref.access_token;
    // persist new token
    await sb(`/rest/v1/provider_accounts?id=eq.${acct.id}`, {
      method: "PATCH",
      body: JSON.stringify({ access_token: access, expires_at: Math.floor(Date.now() / 1000) + ref.expires_in }),
    });
  }

  // Pull recent mail (last 24h); refine later with historyId cursors
  const query = `newer_than:1d -category:promotions -category:social`;
  const listing = await gmailList(access, query);
  const ids = listing.messages?.map((m) => m.id) ?? [];
  if (ids.length === 0) return { count: 0 };

  let count = 0;
  for (const id of ids) {
    const full = await gmailGet(access, id);
    const from = header(full.payload?.headers, "From");
    const subject = header(full.payload?.headers, "Subject");
    const date = header(full.payload?.headers, "Date");
    const body = extractPlainText(full.payload);
    const preview = (full.snippet ?? body?.slice(0, 200) ?? "") || "";

    await upsertEmail({
      user_id: acct.user_id,
      provider: "gmail",
      provider_message_id: full.id,
      provider_thread_id: full.threadId,
      from_email: from,
      subject,
      preview,
      body,
      created_at: date ? new Date(date).toISOString() : (full.internalDate ? new Date(Number(full.internalDate)).toISOString() : new Date().toISOString()),
    });
    count++;
  }
  return { count };
}

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Use POST", { status: 405 });
  }
  try {
    const accounts = await listProviderAccounts();
    const results = [];
    for (const acct of accounts) {
      try {
        const r = await pollAccount(acct);
        results.push({ email: acct.email_address, ...r });
      } catch (e) {
        results.push({ email: acct.email_address, error: String(e) });
      }
    }
    return new Response(JSON.stringify({ ok: true, results }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500 });
  }
});

