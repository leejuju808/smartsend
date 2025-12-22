"use server";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getCampaignRole } from "@/lib/auth/role";
import { can } from "@/lib/auth/permissions";
import { writeAudit } from "../../../lib/data/audit";

async function sb() {
  const cookieStore = await cookies();
  return createServerClient(
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
}

export async function pauseCampaign(campaignId: string, reason = "manual") {
  const role = await getCampaignRole(campaignId);
  if (!can(role, "canSend")) throw new Error("Unauthorized");
  
  const supabase = await sb();
  await supabase
    .from("campaigns")
    .update({ is_paused: true, pause_reason: reason })
    .eq("id", campaignId);
  
  await writeAudit(campaignId, "campaign_paused", { reason });
  return { ok: true };
}

export async function resumeCampaign(campaignId: string) {
  const role = await getCampaignRole(campaignId);
  if (!can(role, "canSend")) throw new Error("Unauthorized");
  
  const supabase = await sb();
  await supabase
    .from("campaigns")
    .update({ is_paused: false, pause_reason: null })
    .eq("id", campaignId);
  
  await writeAudit(campaignId, "campaign_resumed", {});
  return { ok: true };
}

export async function setSpikeAutopause(campaignId: string, enabled: boolean) {
  const role = await getCampaignRole(campaignId);
  if (!can(role, "canSend")) throw new Error("Unauthorized");
  
  const supabase = await sb();
  await supabase
    .from("campaigns")
    .update({ pause_on_spike: enabled })
    .eq("id", campaignId);
  
  await writeAudit(campaignId, "campaign_spike_autopause_toggled", { enabled });
  return { ok: true };
}

export async function pauseLead(campaignId: string, leadId: string, reason = "consecutive_failures") {
  const role = await getCampaignRole(campaignId);
  if (!can(role, "canSend")) throw new Error("Unauthorized");
  
  const supabase = await sb();
  const { data: { user } } = await supabase.auth.getUser();
  
  await supabase
    .from("campaign_leads")
    .update({
      paused_at: new Date().toISOString(),
      paused_by: user!.id,
      pause_reason: reason
    })
    .eq("id", leadId)
    .eq("campaign_id", campaignId);
  
  await writeAudit(campaignId, "lead_paused", { lead_id: leadId, reason });
  return { ok: true };
}

export async function resumeLead(campaignId: string, leadId: string) {
  const role = await getCampaignRole(campaignId);
  if (!can(role, "canSend")) throw new Error("Unauthorized");
  
  const supabase = await sb();
  
  await supabase
    .from("campaign_leads")
    .update({
      paused_at: null,
      paused_by: null,
      pause_reason: null
    })
    .eq("id", leadId)
    .eq("campaign_id", campaignId);
  
  await writeAudit(campaignId, "lead_resumed", { lead_id: leadId });
  return { ok: true };
}

export async function setResumeOnReply(campaignId: string, enabled: boolean) {
  const role = await getCampaignRole(campaignId);
  if (!can(role, "canSend")) throw new Error("Unauthorized");

  const supabase = await sb();
  await supabase.from("campaigns").update({ resume_on_reply: enabled }).eq("id", campaignId);
  await writeAudit(campaignId, "campaign_resume_on_reply_toggled", { enabled });
  return { ok: true };
}

