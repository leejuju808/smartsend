import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const DEFAULT_DELAY_MS = 150;

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const payload = await req.json().catch(() => ({}));
  const { account_id, limit = 50, force = false } = payload ?? {};

  const { data: candidates, error } = await sb.rpc("list_enrichment_candidates", {
    p_account: account_id ?? null,
    p_limit: limit,
  });

  if (error) {
    console.error("list_enrichment_candidates failed", error);
    return json({ error: "Failed to list candidates" }, 500);
  }

  let processed = 0;

  for (const row of candidates ?? []) {
    const body = JSON.stringify({ lead_id: row.id, force });
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/lead-enrich`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_KEY}`,
        },
        body,
      });

      if (res.ok) {
        processed += 1;
      } else {
        console.warn("lead-enrich call failed", row.id, await safeJson(res));
      }
    } catch (err) {
      console.error("lead-enrich fetch failed", row.id, err);
    }

    await delay(DEFAULT_DELAY_MS + jitter(50));
  }

  return json({
    ok: true,
    processed,
    candidates: candidates?.length ?? 0,
  });
});

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitter(range: number) {
  return Math.floor(Math.random() * range);
}

async function safeJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return await res.text();
  }
}

