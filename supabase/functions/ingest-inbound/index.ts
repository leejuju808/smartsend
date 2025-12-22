// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LABEL_ENDPOINT = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/ai_label_message`;

function timingSafeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let out = 0; for (let i=0;i<a.length;i++) out |= a[i]^b[i]; return out===0;
}

async function verifyWebhook(billing_account_id: string, payloadText: string, signature: string) {
  const { data: ba } = await supabase
    .from("billing_accounts")
    .select("webhook_secret")
    .eq("id", billing_account_id)
    .single();
  if (!ba?.webhook_secret) return false;

  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(ba.webhook_secret), {name:"HMAC", hash:"SHA-256"}, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadText));
  const hex = Array.from(new Uint8Array(mac)).map(b=>b.toString(16).padStart(2,"0")).join("");
  const a = new TextEncoder().encode(hex);
  const b = new TextEncoder().encode((signature||"").toLowerCase());
  return timingSafeEqual(a,b);
}

async function ensureThread(account_id: string, campaign_id: string | null, lead_id: string) {
  // find existing thread or create
  const { data: found } = await supabase
    .from("inbox_threads")
    .select("id")
    .eq("account_id", account_id)
    .eq("lead_id", lead_id)
    .maybeSingle();

  if (found?.id) return found.id;

  const { data: created, error } = await supabase
    .from("inbox_threads")
    .insert({ account_id, lead_id, campaign_id })
    .select("id")
    .single();

  if (error) throw error;
  return created.id as string;
}

Deno.serve(async (req) => {
  try {
    const raw = await req.text();
    const payload = JSON.parse(raw);
    // Expected normalized fields from your provider adapter:
    // { account_id, campaign_id?, lead_id?, from_email, to_email, subject, html, received_at?, provider_msg_id }

    const {
      account_id, campaign_id = null, lead_id, from_email, to_email,
      subject = "", html = "", received_at = new Date().toISOString(),
      provider_msg_id = null
    } = payload;

    if (!account_id || !lead_id || !from_email || !to_email) {
      return new Response(JSON.stringify({ ok:false, error:"missing required fields" }), { status: 400 });
    }

    const sig = req.headers.get("x-webhook-signature") ?? "";
    const baId = (payload && payload.billing_account_id) ? String(payload.billing_account_id) : null;
    if (!baId || !(await verifyWebhook(baId, raw, sig))) {
      return new Response("Invalid signature", { status: 401 });
    }

    const thread_id = await ensureThread(account_id, campaign_id, lead_id);

    const { data: inserted, error } = await supabase.from("inbox_messages").insert({
      thread_id,
      direction: "inbound",
      account_id,
      campaign_id,
      lead_id,
      from_email,
      to_email,
      subject,
      body_html: html,
      provider_msg_id,
      received_at: received_at
    }).select("id").maybeSingle();

    if (error) throw error;

    if (inserted?.id) {
      try {
        await fetch(LABEL_ENDPOINT, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({ message_id: inserted.id }),
        });
      } catch (labelErr) {
        console.warn("ingest-inbound label trigger failed", labelErr);
      }
    }

    return new Response(JSON.stringify({ ok: true }), { headers: { "content-type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ ok:false, error: String(e) }), { status: 500, headers: { "content-type": "application/json" } });
  }
});

