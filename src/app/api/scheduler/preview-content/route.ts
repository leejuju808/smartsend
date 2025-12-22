import { createClient } from "@supabase/supabase-js";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const campaign = u.searchParams.get("campaign");
  const step = u.searchParams.get("step");
  const lead = u.searchParams.get("lead");
  const extra = u.searchParams.get("extra"); // JSON string optional

  if (!campaign || !step || !lead) {
    return new Response("campaign, step, and lead query params required", { status: 400 });
  }

  const authHeader = req.headers.get("Authorization");
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: authHeader ? { Authorization: authHeader } : {} }
    }
  );

  const { data, error } = await sb.rpc("resolve_step_content", {
    p_campaign: campaign,
    p_step: Number(step),
    p_lead: lead,
    p_extra: extra ? JSON.parse(extra) : {}
  });

  if (error) return new Response(error.message, { status: 400 });

  // data is an array with one row
  const row = Array.isArray(data) ? data[0] : data;
  return new Response(JSON.stringify(row ?? null), {
    headers: { "content-type": "application/json" }
  });
}

