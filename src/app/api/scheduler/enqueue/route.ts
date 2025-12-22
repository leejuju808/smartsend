import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  const { campaign_id, step_no, lead_id, base, jitter = true, extra = {} } = await req.json();

  if (!campaign_id || !step_no || !lead_id) {
    return new Response("campaign_id, step_no, lead_id required", { status: 400 });
  }

  const authHeader = req.headers.get("Authorization");
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: authHeader ? { Authorization: authHeader } : {} }
    }
  );

  const { data: planOk, error: planErr } = await sb.rpc("can_send_under_plan", { p_campaign: campaign_id });
  if (planErr) {
    return new Response(planErr.message ?? "Plan check failed", { status: 400 });
  }

  if (planOk !== true) {
    return new Response(JSON.stringify({ ok: false, error: "Monthly send limit reached. Upgrade to send more." }), {
      status: 402,
      headers: { "content-type": "application/json" },
    });
  }

  const { data, error } = await sb.rpc("enqueue_next_send_for_step", {
    p_campaign: campaign_id,
    p_step_no: step_no,
    p_lead: lead_id,
    p_base: base ? new Date(base).toISOString() : null,
    p_include_jitter: !!jitter,
    p_extra: extra
  });

  if (error) return new Response(error.message, { status: 400 });
  return new Response(JSON.stringify({ scheduled_at: data }), {
    headers: { "content-type": "application/json" }
  });
}

