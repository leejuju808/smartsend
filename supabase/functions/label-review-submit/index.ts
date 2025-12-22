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

const VALID_LABELS = new Set([
  "positive",
  "neutral",
  "objection",
  "meeting_intent",
  "out_of_office",
  "unsubscribe",
  "bounce",
  "other",
]);

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

  const { owner_id, queue_id, thread_id, message_id, gold_label, notes } =
    payload as {
      owner_id?: string;
      queue_id?: string;
      thread_id?: string;
      message_id?: string;
      gold_label?: string;
      notes?: string;
    };

  if (!owner_id || !queue_id || !message_id || !gold_label) {
    return jsonResponse({ error: "missing params" }, 400);
  }

  if (!VALID_LABELS.has(gold_label)) {
    return jsonResponse({ error: "invalid gold_label" }, 400);
  }

  const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { error: insertErr } = await client.from("reply_labels_gold").insert({
    owner_id,
    thread_id,
    message_id,
    gold_label,
    notes,
  });

  if (insertErr) {
    if (!insertErr.message?.toLowerCase().includes("duplicate")) {
      console.error("reply_labels_gold insert failed", insertErr);
      return jsonResponse({ error: insertErr.message }, 500);
    }
  }

  const { error: queueErr } = await client
    .from("label_review_queue")
    .update({ status: "labeled" })
    .eq("id", queue_id)
    .eq("owner_id", owner_id);

  if (queueErr) {
    console.error("label_review_queue update failed", queueErr);
    return jsonResponse({ error: queueErr.message }, 500);
  }

  return jsonResponse({ ok: true });
});
















