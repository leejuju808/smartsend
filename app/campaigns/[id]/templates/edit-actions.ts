"use server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getCampaignRole } from "@/lib/auth/role";
import { can } from "@/lib/auth/permissions";
import { setActiveVersion, createVersion } from "@/lib/data/templates";

function sb(){ return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies }); }

export async function updateVersion(formData: FormData): Promise<void> {
  const campaignId = String(formData.get("campaignId"));
  const versionId  = String(formData.get("versionId"));
  const subject    = String(formData.get("subject") ?? "");
  const body_md    = String(formData.get("body_md") ?? "");
  const role = await getCampaignRole(campaignId); if (!can(role, "canSend")) throw new Error("Unauthorized");
  const supabase = sb();
  await supabase.from("template_versions").update({ subject, body_md }).eq("id", versionId);
}

export async function cloneFromActive(formData: FormData): Promise<void> {
  const campaignId = String(formData.get("campaignId"));
  const variant    = String(formData.get("variant"));
  const label      = String(formData.get("label") || "clone");
  const role = await getCampaignRole(campaignId); if (!can(role, "canSend")) throw new Error("Unauthorized");

  const supabase = sb();
  const { data: active } = await supabase.from("variant_active_version")
    .select("template_version_id").eq("campaign_id", campaignId).eq("variant_key", variant).maybeSingle();
  if (!active?.template_version_id) throw new Error("No active version");

  const { data: v } = await supabase.from("template_versions")
    .select("subject, body_md").eq("id", active.template_version_id).maybeSingle();

  await createVersion({
    campaignId, variant, label, subject: v?.subject ?? "", body_md: v?.body_md ?? "", makeActive: false
  });
}

export async function quickPromote(formData: FormData): Promise<void> {
  const campaignId = String(formData.get("campaignId"));
  const variant    = String(formData.get("variant"));
  const versionId  = String(formData.get("versionId"));
  const role = await getCampaignRole(campaignId); if (!can(role, "canSend")) throw new Error("Unauthorized");
  await setActiveVersion(campaignId, variant, versionId);
}

