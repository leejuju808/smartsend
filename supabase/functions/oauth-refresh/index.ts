// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions@1.4.0/types";
import { createClient } from "jsr:@supabase/supabase-js";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const GMAIL_CLIENT_ID = Deno.env.get("GMAIL_CLIENT_ID")!;
const GMAIL_CLIENT_SECRET = Deno.env.get("GMAIL_CLIENT_SECRET")!;
const MS_CLIENT_ID = Deno.env.get("MS_CLIENT_ID")!;
const MS_CLIENT_SECRET = Deno.env.get("MS_CLIENT_SECRET")!;
const MS_TENANT = Deno.env.get("MS_TENANT") || "common";

type Req = {
  account_id?: string;
  user_id?: string;
  dry_run?: boolean;
};

type Account = {
  id: string;
  user_id: string;
  provider: "gmail" | "outlook";
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  email: string | null;
  meta: any;
};

function jitter(ms: number) {
  const r = Math.random() * 0.35 + 0.65;
  return ms * r;
}

async function refreshGmail(acc: Account) {
  if (!acc.refresh_token) throw new Error("Missing refresh_token");
  const body = new URLSearchParams({
    client_id: GMAIL_CLIENT_ID,
    client_secret: GMAIL_CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: acc.refresh_token,
  });
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Gmail token refresh failed: ${resp.status} ${t}`);
  }
  const j = await resp.json();
  const access_token = j.access_token as string;
  const expires_in = Number(j.expires_in ?? 3600);
  const expires_at = new Date(Date.now() + jitter(expires_in * 1000 - 60_000)).toISOString();
  return { access_token, expires_at };
}

async function refreshOutlook(acc: Account) {
  if (!acc.refresh_token) throw new Error("Missing refresh_token");
  const body = new URLSearchParams({
    client_id: MS_CLIENT_ID,
    client_secret: MS_CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: acc.refresh_token,
    scope: "offline_access Mail.ReadWrite Mail.Send",
  });
  const resp = await fetch(`https://login.microsoftonline.com/${MS_TENANT}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`Outlook token refresh failed: ${resp.status} ${t}`);
  }
  const j = await resp.json();
  const access_token = j.access_token as string;
  const expires_in = Number(j.expires_in ?? 3600);
  const new_refresh = j.refresh_token as string | undefined;
  const expires_at = new Date(Date.now() + jitter(expires_in * 1000 - 60_000)).toISOString();
  return { access_token, expires_at, refresh_token: new_refresh };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const sb = createClient(SB_URL, SRK);

  try {
    const body = (await req.json()) as Req;

    let q = sb.from("connected_accounts").select("*");
    if (body.account_id) {
      q = q.eq("id", body.account_id);
    } else if (body.user_id) {
      q = q.eq("user_id", body.user_id);
    } else {
      const soon = await sb
        .from("v_accounts_expiring_soon")
        .select("id");
      if (soon.error) throw soon.error;
      const ids = (soon.data ?? []).map((r: any) => r.id);
      if (!ids.length) {
        return new Response(
          JSON.stringify({ ok: true, count: 0, results: [] }),
          { status: 200 }
        );
      }
      q = q.in("id", ids);
    }

    const { data: accs, error: eacc } = await q;
    if (eacc) throw eacc;

    const targets = (accs || []).filter((a) => a.refresh_token);
    const results: any[] = [];

    for (const acc of targets as Account[]) {
      const numeric = acc.id.replace(/-/g, "");
      const lockKey = BigInt(`9${numeric.slice(0, 15)}`);
      const { data: got } = await sb.rpc("try_advisory_lock", { p_key: lockKey.toString() as any });
      if (!got) {
        results.push({ id: acc.id, result: "skipped", reason: "locked" });
        continue;
      }

      try {
        if (body.dry_run) {
          results.push({ id: acc.id, result: "skipped", reason: "dry_run" });
        } else {
          let next: { access_token: string; expires_at: string; refresh_token?: string } | null = null;
          if (acc.provider === "gmail") {
            next = await refreshGmail(acc);
          } else if (acc.provider === "outlook") {
            next = await refreshOutlook(acc);
          } else {
            results.push({ id: acc.id, result: "skipped", reason: `unknown provider ${acc.provider}` });
          }

          if (next) {
            await sb.rpc("_oauth_update_tokens", {
              p_account_id: acc.id,
              p_access_token: next.access_token,
              p_expires_at: next.expires_at,
            });

            if (next.refresh_token) {
              await sb
                .from("connected_accounts")
                .update({ refresh_token: next.refresh_token })
                .eq("id", acc.id);
            }

            results.push({ id: acc.id, result: "ok", next_expires_at: next.expires_at });
            await sb.from("oauth_refresh_logs").insert({
              account_id: acc.id,
              provider: acc.provider,
              result: "ok",
              next_expires_at: next.expires_at,
              meta: { email: acc.email },
            });
          }
        }
      } catch (e: any) {
        const msg = String(e?.message ?? e);
        results.push({ id: acc.id, result: "error", reason: msg });
        await sb.from("oauth_refresh_logs").insert({
          account_id: acc.id,
          provider: acc.provider,
          result: "error",
          reason: msg,
          meta: { email: acc.email },
        });
      } finally {
        await sb.rpc("advisory_unlock", { p_key: lockKey.toString() as any });
      }
    }

    return new Response(
      JSON.stringify({ ok: true, count: results.length, results }),
      { status: 200 }
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({ ok: false, error: String(e?.message ?? e) }),
      { status: 400 }
    );
  }
});

