import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const body = await req.json();

  const {
    provider,
    provider_message_id,
    campaign_id,
    lead_id,
    subject,
    body: text,
    received_at,
  } = body || {};

  if (!provider || !provider_message_id) {
    return new Response("provider and provider_message_id required", { status: 400 });
  }

  const { data, error } = await admin.rpc("upsert_bounce_message", {
    p_provider: provider,
    p_provider_message_id: provider_message_id,
    p_campaign: campaign_id ?? null,
    p_lead: lead_id ?? null,
    p_subject: subject ?? "Delivery failure",
    p_body: text ?? "Delivery failed",
    p_received_at: received_at ?? new Date().toISOString(),
  });

  if (error) {
    return new Response(error.message, { status: 400 });
  }

  return new Response(
    JSON.stringify({ ok: true, inbox_message_id: data }),
    { headers: { "content-type": "application/json" } }
  );
}