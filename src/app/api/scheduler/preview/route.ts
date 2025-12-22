import { createClient } from "@supabase/supabase-js";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const campaign = u.searchParams.get("campaign");
  const step = u.searchParams.get("step");
  const lead = u.searchParams.get("lead");
  const includeJitter = u.searchParams.get("jitter") !== "false";
  const base = u.searchParams.get("base"); // ISO or null

  if (!campaign || !step || !lead) {
    return new Response("campaign, step, lead required", { status: 400 });
  }

  const authHeader = req.headers.get("Authorization");
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: authHeader ? { Authorization: authHeader } : {} }
    }
  );

  const { data, error } = await sb.rpc("preview_next_send_for_step", {
    p_campaign: campaign,
    p_step_no: Number(step),
    p_lead: lead,
    p_base: base ? new Date(base).toISOString() : null,
    p_include_jitter: includeJitter
  });

  if (error) return new Response(error.message, { status: 400 });
  return new Response(JSON.stringify(data?.[0] ?? null), {
    headers: { "content-type": "application/json" }
  });
}
