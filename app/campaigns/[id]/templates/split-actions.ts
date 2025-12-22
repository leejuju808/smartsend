"use server";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getCampaignRole } from "@/lib/auth/role";
import { can } from "@/lib/auth/permissions";

function sb() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies }
  );
}

export async function upsertSplit(formData: FormData): Promise<void> {
  const campaignId = String(formData.get("campaignId"));
  const variant = String(formData.get("variant"));
  const versionId = String(formData.get("versionId"));
  const weight = Math.max(0, Math.min(100, Number(formData.get("weight")) || 0));

  const role = await getCampaignRole(campaignId);
  if (!can(role, "canSend")) throw new Error("Unauthorized");

  const supabase = sb();
  await supabase
    .from("variant_split")
    .upsert(
      {
        campaign_id: campaignId,
        variant_key: variant,
        template_version_id: versionId,
        weight,
      },
      { onConflict: "campaign_id,variant_key,template_version_id" }
    );

  return;
}

export async function clearSplit(formData: FormData): Promise<void> {
  const campaignId = String(formData.get("campaignId"));
  const variant = String(formData.get("variant"));

  const role = await getCampaignRole(campaignId);
  if (!can(role, "canSend")) throw new Error("Unauthorized");

  const supabase = sb();
  await supabase
    .from("variant_split")
    .delete()
    .eq("campaign_id", campaignId)
    .eq("variant_key", variant);
  return;
}

export async function setAutopromote(formData: FormData): Promise<void> {
  const campaignId = String(formData.get("campaignId"));
  const enabled = formData.get("enabled") === "on";
  const minSamples = Math.max(20, Number(formData.get("minSamples")) || 100);
  const delta = Math.max(0, Number(formData.get("delta")) || 0.02);

  const role = await getCampaignRole(campaignId);
  if (!can(role, "canSend")) throw new Error("Unauthorized");

  const supabase = sb();
  await supabase
    .from("campaigns")
    .update({
      ab_autopromote: enabled,
      ab_min_samples: minSamples,
      ab_promotion_delta: delta,
    })
    .eq("id", campaignId);

  return;
}

