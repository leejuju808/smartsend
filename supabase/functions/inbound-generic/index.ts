import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// @ts-ignore - Supabase client is resolved by Deno at runtime via jsr protocol
import { createClient } from "jsr:@supabase/supabase-js@2";

declare const Deno: any;

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  const secret = req.headers.get("X-Webhook-Secret");
  if (secret !== Deno.env.get("INBOUND_WEBHOOK_SECRET")) {
    return new Response("Unauthorized", { status: 401, headers: corsHeaders });
  }

  const required = ["provider", "campaign_id", "lead_id", "provider_thread_id"] as const;
  for (const k of required) {
    if (!body?.[k]) {
      return new Response(JSON.stringify({ ok: false, error: `Missing ${k}` }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
  }

  const { error } = await supabase.rpc("upsert_inbound_message", {
    p_provider: body.provider,
    p_provider_thread_id: body.provider_thread_id,
    p_provider_message_id: body.provider_message_id ?? null,
    p_campaign: body.campaign_id,
    p_lead: body.lead_id,
    p_subject: body.subject ?? null,
    p_snippet: body.snippet ?? null,
    p_body_html: body.body_html ?? null,
    p_created_at: body.created_at ?? new Date().toISOString(),
    p_ai_label: body.ai_label ?? null,
  });

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
});

