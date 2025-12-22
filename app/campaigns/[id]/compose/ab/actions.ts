"use server";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { z } from "zod";
import { can } from "@/lib/auth/permissions";
import { getCampaignRole } from "@/lib/auth/role";

const Schema = z.object({
  campaignId: z.string().uuid(),
  templateId: z.string().uuid(),
  variantA: z.string().min(1),
  variantB: z.string().min(1),
  enabled: z.coerce.boolean()
});

export async function saveAB(_: any, formData: FormData) {
  const input = Schema.parse({
    campaignId: formData.get("campaignId"),
    templateId: formData.get("templateId"),
    variantA: formData.get("variantA"),
    variantB: formData.get("variantB"),
    enabled: formData.get("enabled") ?? "true"
  });

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

  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const role = await getCampaignRole(input.campaignId);
  if (!can(role, "canEditCampaign")) throw new Error("Unauthorized");

  // quick existence check
  const { data: existA } = await sb.from("template_versions")
    .select("id").eq("template_id", input.templateId).eq("variant_key", input.variantA).maybeSingle();
  const { data: existB } = await sb.from("template_versions")
    .select("id").eq("template_id", input.templateId).eq("variant_key", input.variantB).maybeSingle();
  if (!existA || !existB) throw new Error("Variant(s) not found");

  await sb.from("campaigns").update({
    ab_enabled: input.enabled,
    ab_template_id: input.templateId,
    ab_variant_a: input.variantA,
    ab_variant_b: input.variantB
  }).eq("id", input.campaignId);

  return { ok: true };
}

