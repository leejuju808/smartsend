import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const campaignId = params.id;
  const url = new URL(req.url);
  const range = url.searchParams.get("range") || "7d"; // '7d' | '30d' | custom
  const to = new Date();
  const from = new Date(to);
  if (range === "30d") from.setDate(to.getDate() - 30);
  else from.setDate(to.getDate() - 7);

  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  const [funnel, steps, variants] = await Promise.all([
    admin.rpc("campaign_funnel", { p_campaign: campaignId, p_from: from.toISOString(), p_to: to.toISOString() }),
    admin.rpc("campaign_step_breakdown", { p_campaign: campaignId, p_from: from.toISOString(), p_to: to.toISOString() }),
    admin.rpc("campaign_variant_breakdown", { p_campaign: campaignId, p_from: from.toISOString(), p_to: to.toISOString() }),
  ]);

  if (funnel.error) return new Response(funnel.error.message, { status: 400 });
  if (steps.error) return new Response(steps.error.message, { status: 400 });
  if (variants.error) return new Response(variants.error.message, { status: 400 });

  return new Response(JSON.stringify({
    range,
    from: from.toISOString(),
    to: to.toISOString(),
    funnel: funnel.data,         // [{stage, count}]
    steps: steps.data,           // [{step_no, sent, opens, clicks, replies, ...rates}]
    variants: variants.data      // [{step_no, variant_id, variant_name, ...}]
  }), { headers: { "content-type": "application/json", "cache-control": "no-store" }});
}

