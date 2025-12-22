import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function sb() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies }
  );
}

export async function getVariantSplit(campaignId: string, variant: string) {
  const supabase = sb();
  const { data } = await supabase
    .from("variant_split")
    .select("template_version_id, weight")
    .eq("campaign_id", campaignId)
    .eq("variant_key", variant)
    .order("template_version_id");
  return data ?? [];
}

export function pickByWeight(
  weights: Array<{ id: string; w: number }>,
  rnd = Math.random()
) {
  const total = weights.reduce((s, x) => s + x.w, 0);
  if (total <= 0) return weights[0]?.id ?? null;
  let r = rnd * total;
  for (const x of weights) {
    if ((r -= x.w) <= 0) return x.id;
  }
  return weights[weights.length - 1]?.id ?? null;
}

