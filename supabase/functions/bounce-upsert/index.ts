import "jsr:@supabase/functions@1.4.0/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js";

const SB_URL = Deno.env.get("SUPABASE_URL");
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SB_URL || !SB_KEY) {
  console.error("bounce-upsert: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
}

type BounceProvider = "gmail" | "outlook";

type BouncePayload = {
  provider: BounceProvider;
  account_id?: string;
  campaign_id?: string;
  lead_id?: string;
  to_email?: string;
  provider_message_id?: string;
  reason?: string;
  raw?: unknown;
};

const client = SB_URL && SB_KEY
  ? createClient(SB_URL, SB_KEY, { auth: { persistSession: false } })
  : null;

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  if (!client) {
    return new Response(JSON.stringify({ ok: false, error: "Server not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = (await req.json()) as BouncePayload;

    if (!body || typeof body !== "object") {
      throw new Error("invalid payload");
    }

    if (!body.provider) {
      throw new Error("provider required");
    }

    if (!body.provider_message_id && !body.reason) {
      console.warn("bounce-upsert: missing provider_message_id/reason");
    }

    let accountId: string | null = body.account_id ?? null;
    if (!accountId && body.to_email) {
      const { data: acc, error: accError } = await client
        .from("connected_accounts")
        .select("id")
        .eq("email", body.to_email)
        .maybeSingle();
      if (accError) throw accError;
      accountId = acc?.id ?? null;
    }

    let leadId: string | null = body.lead_id ?? null;
    if (!leadId && body.to_email) {
      const { data: lead, error: leadError } = await client
        .from("leads")
        .select("id")
        .eq("email", body.to_email)
        .maybeSingle();
      if (leadError) throw leadError;
      leadId = lead?.id ?? null;
    }

    if (!leadId) {
      throw new Error("lead_id or to_email required to resolve lead");
    }

    let campaignId: string | null = body.campaign_id ?? null;
    if (!campaignId) {
      const { data: camp, error: campError } = await client
        .from("send_logs")
        .select("campaign_id")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (campError) throw campError;
      campaignId = camp?.campaign_id ?? null;
    }

    if (!campaignId) {
      throw new Error("campaign_id could not be resolved for this lead");
    }

    const { error } = await client.rpc("record_bounce", {
      p_account: accountId,
      p_campaign: campaignId,
      p_lead: leadId,
      p_provider: body.provider,
      p_provider_message_id: body.provider_message_id ?? null,
      p_reason: body.reason ?? "provider:bounce",
      p_raw: body.raw ?? {},
    });

    if (error) {
      throw error;
    }

    return new Response(JSON.stringify({ ok: true, lead_id: leadId, campaign_id: campaignId }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("bounce-upsert error", error);
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
});

