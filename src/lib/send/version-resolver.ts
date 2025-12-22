import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getVariantSplit, pickByWeight } from "@/lib/data/variant-split";

export async function resolveActiveVersionId(
  campaignId: string,
  variantKey: string
) {
  const cookieStore = await cookies();
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    }
  );
  const { data } = await sb
    .from("variant_active_version")
    .select("template_version_id")
    .eq("campaign_id", campaignId)
    .eq("variant_key", variantKey)
    .maybeSingle();
  return data?.template_version_id ?? null;
}

export async function resolveEnqueueVersionId(
  campaignId: string,
  variantKey: string
) {
  const cookieStore = await cookies();
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    }
  );

  // 1) If split exists, pick by weight
  const split = await getVariantSplit(campaignId, variantKey);
  if (split.length > 0) {
    const id = pickByWeight(
      split.map((s) => ({ id: s.template_version_id, w: s.weight }))
    );
    return id;
  }

  // 2) Fallback to active pointer
  const { data } = await sb
    .from("variant_active_version")
    .select("template_version_id")
    .eq("campaign_id", campaignId)
    .eq("variant_key", variantKey)
    .maybeSingle();
  return data?.template_version_id ?? null;
}

