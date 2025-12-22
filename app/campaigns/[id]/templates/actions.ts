"use server";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getCampaignRole } from "@/lib/auth/role";
import { can } from "@/lib/auth/permissions";
import { createVersion, setActiveVersion } from "@/lib/data/templates";

export async function createTemplateVersion(
  formData: FormData
): Promise<void> {
  const campaignId = String(formData.get("campaignId"));
  const variant = String(formData.get("variant"));
  const label = String(formData.get("label"));
  const subject = String(formData.get("subject"));
  const body_md = String(formData.get("body_md"));
  const makeActive = formData.get("makeActive") === "on";

  const role = await getCampaignRole(campaignId);
  if (!can(role, "canSend")) throw new Error("Unauthorized");

  await createVersion({
    campaignId,
    variant,
    label,
    subject,
    body_md,
    makeActive,
  });
}

export async function activateVersion(formData: FormData): Promise<void> {
  const campaignId = String(formData.get("campaignId"));
  const variant = String(formData.get("variant"));
  const versionId = String(formData.get("versionId"));

  const role = await getCampaignRole(campaignId);
  if (!can(role, "canSend")) throw new Error("Unauthorized");

  await setActiveVersion(campaignId, variant, versionId);
}

