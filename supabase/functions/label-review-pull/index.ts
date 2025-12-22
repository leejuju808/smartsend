import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Json = Record<string, unknown>;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const jsonResponse = (body: Json, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "method not allowed" }, 405);
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing Supabase env vars");
    return jsonResponse({ error: "server misconfigured" }, 500);
  }

  const payload = await req.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return jsonResponse({ error: "invalid payload" }, 400);
  }

  const { owner_id, k } = payload as {
    owner_id?: string;
    k?: number;
  };

  if (!owner_id) {
    return jsonResponse({ error: "missing owner_id" }, 400);
  }

  const limit = Number.isFinite(k) && k > 0 ? Math.min(Math.trunc(k), 100) : 25;

  const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: picks, error: pickErr } = await client
    .rpc("sample_for_label_review", { owner_in: owner_id, k: limit })
    .select("*");

  if (pickErr) {
    console.error("sample_for_label_review failed", pickErr);
    return jsonResponse({ error: pickErr.message }, 500);
  }

  if (picks?.length) {
    const rows = picks.map((p: Record<string, unknown>) => ({
      owner_id,
      thread_id: p.thread_id,
      message_id: p.message_id,
      reason: p.reason,
      scores: p.scores,
    }));

    const { error: enqueueErr } = await client
      .from("label_review_queue")
      .upsert(rows, {
        onConflict: "owner_id,message_id",
        ignoreDuplicates: true,
      });

    if (enqueueErr) {
      console.error("label_review_queue upsert failed", enqueueErr);
      return jsonResponse({ error: enqueueErr.message }, 500);
    }
  }

  const { data: open, error: openErr } = await client
    .from("label_review_queue")
    .select("id,thread_id,message_id,reason,scores,created_at")
    .eq("owner_id", owner_id)
    .eq("status", "open")
    .order("created_at", { ascending: true })
    .limit(limit);

  if (openErr) {
    console.error("label_review_queue fetch failed", openErr);
    return jsonResponse({ error: openErr.message }, 500);
  }

  return jsonResponse({ items: open ?? [] });
});
















