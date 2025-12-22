"use server";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { z } from "zod";
import { getCampaignRole } from "@/lib/auth/role";
import { can } from "@/lib/auth/permissions";

function sb() {
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies });
}

export async function pauseCampaign(campaignId: string) {
  const supabase = sb();
  const role = await getCampaignRole(campaignId);
  if (!can(role, "canSend")) throw new Error("Unauthorized");
  await supabase.from("campaigns").update({ status: "paused" }).eq("id", campaignId);
  return { ok: true };
}

export async function resumeCampaign(campaignId: string) {
  const supabase = sb();
  const role = await getCampaignRole(campaignId);
  if (!can(role, "canSend")) throw new Error("Unauthorized");
  await supabase.from("campaigns").update({ status: "active" }).eq("id", campaignId);
  return { ok: true };
}

export async function cancelQueued(campaignId: string) {
  const supabase = sb();
  const role = await getCampaignRole(campaignId);
  if (!can(role, "canSend")) throw new Error("Unauthorized");
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from("send_queue").update({
    canceled_at: new Date().toISOString(),
    canceled_by: user!.id
  }).eq("campaign_id", campaignId).eq("status","queued").is("canceled_at", null);
  return { ok: true };
}

const BoostSchema = z.object({
  queueId: z.string().uuid(),
  priority: z.coerce.number().min(0).max(100)
});

export async function boostPriority(_: any, formData: FormData) {
  const supabase = sb();
  const { queueId, priority } = BoostSchema.parse({
    queueId: formData.get("queueId"),
    priority: formData.get("priority")
  });

  // read campaign_id to check role
  const { data: q } = await supabase.from("send_queue").select("campaign_id").eq("id", queueId).single();
  const role = await getCampaignRole(q!.campaign_id);
  if (!can(role, "canSend")) throw new Error("Unauthorized");

  await supabase.from("send_queue").update({ priority }).eq("id", queueId);
  return { ok: true };
}

