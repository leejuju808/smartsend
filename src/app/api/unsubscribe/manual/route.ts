import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { campaign_id, email, reason, details, promote_global = true } = await req.json();

  if (!campaign_id || !email) {
    return new Response("campaign_id and email required", { status: 400 });
  }

  const { data: tok, error: mintError } = await admin.rpc("mint_unsubscribe_token", {
    p_campaign: campaign_id,
    p_lead: null,
    p_send_log: null,
    p_email: email,
    p_ttl_minutes: 5
  } as any);

  if (mintError || !tok) {
    return new Response(mintError?.message || "failed to mint token", { status: 400 });
  }

  const { error } = await admin.rpc("record_unsubscribe", {
    p_token: tok,
    p_reason: reason ?? null,
    p_details: details ?? null,
    p_promote_global: !!promote_global
  });

  if (error) {
    return new Response(error.message, { status: 400 });
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json" }
  });
}

