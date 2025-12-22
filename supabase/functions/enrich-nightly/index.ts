// @ts-nocheck
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Lead = {
  id: string;
  account_id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DEFAULT_LIMIT = 500;

function createSB() {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "content-type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const limitParam = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.floor(limitParam) : DEFAULT_LIMIT;
  const accountFilter = url.searchParams.get("account_id") ?? undefined;

  const sb = createSB();

  const accountIds = await listAccounts(sb, accountFilter);
  let processed = 0;
  let enqueued = 0;

  for (const accountId of accountIds) {
    if (processed >= limit) break;

    const remaining = limit - processed;
    const leads = await getLeadsNeedingRefresh(sb, remaining, accountId);

    for (const lead of leads) {
      if (processed >= limit) break;

      const key = await cacheKey(sb, lead).catch((err) => {
        console.error("cacheKey failed", lead.id, err);
        return null;
      });
      if (!key) {
        processed += 1;
        continue;
      }

      const fresh = await hasFresh(sb, lead.id, key).catch((err) => {
        console.error("hasFresh failed", lead.id, err);
        return false;
      });
      if (fresh) {
        processed += 1;
        continue;
      }

      const vendor = await pickVendor(sb, lead.account_id);
      if (!vendor) {
        processed += 1;
        continue;
      }

      await enqueueJob(sb, lead, vendor, key).catch((err: any) => {
        console.error("enqueueJob failed", vendor, lead.id, err);
      });

      processed += 1;
      enqueued += 1;
    }
  }

  return json({ processed, enqueued });
});

async function listAccounts(sb: any, accountId?: string): Promise<string[]> {
  if (accountId) return [accountId];

  const { data, error } = await sb
    .from("account_members")
    .select("account_id")
    .eq("is_active", true);

  if (error) {
    console.error("listAccounts error", error);
    return [];
  }

  const ids = new Set<string>();
  for (const row of data ?? []) {
    if (row?.account_id) ids.add(row.account_id);
  }
  return [...ids];
}

async function getLeadsNeedingRefresh(sb: any, limit: number, accountId: string): Promise<Lead[]> {
  const { data, error } = await sb.rpc("leads_needing_enrichment", {
    p_limit: limit,
    p_account: accountId,
  });

  if (error) {
    console.error("getLeadsNeedingRefresh error", accountId, error);
    return [];
  }

  return (data ?? []) as Lead[];
}

async function cacheKey(sb: any, lead: Lead): Promise<string> {
  const domain = lead.email?.includes("@") ? lead.email.split("@")[1] : null;
  const name = [lead.first_name, lead.last_name].filter(Boolean).join(" ");
  const { data, error } = await sb.rpc("enrichment_cache_key", {
    p_email: lead.email,
    p_domain: domain,
    p_name: name || null,
    p_company: lead.company,
  });

  if (error) throw error;
  return data as string;
}

async function hasFresh(sb: any, leadId: string, key: string): Promise<boolean> {
  const { data, error } = await sb
    .from("lead_enrichment")
    .select("fetched_at,ttl_seconds")
    .eq("lead_id", leadId)
    .eq("cache_key", key)
    .order("fetched_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("hasFresh error", leadId, error);
    return false;
  }

  if (!data) return false;

  const fetchedAt = new Date(data.fetched_at).getTime();
  const ttlMillis = (data.ttl_seconds ?? 0) * 1000;
  return Date.now() < fetchedAt + ttlMillis;
}

async function pickVendor(sb: any, accountId: string): Promise<string | null> {
  const { error: setError } = await sb.rpc("set_account", { p_account_id: accountId });
  if (setError) {
    console.error("pickVendor set_account error", accountId, setError);
  }

  const { data, error } = await sb.rpc("pick_enrichment_vendor");
  if (error) {
    console.error("pickVendor rpc error", accountId, error);
    return null;
  }

  return (data ?? null) as string | null;
}

async function enqueueJob(sb: any, lead: Lead, source: string, cache: string) {
  await sb.from("enrichment_jobs").upsert(
    {
      account_id: lead.account_id,
      lead_id: lead.id,
      source,
      cache_key: cache,
      status: "pending",
      next_run_at: new Date().toISOString(),
    },
    { onConflict: "lead_id,source,cache_key" }
  );
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
