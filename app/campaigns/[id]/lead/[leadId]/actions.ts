"use server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getCampaignRole } from "@/lib/auth/role";
import { can } from "@/lib/auth/permissions";

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

export async function retryFailedForLead(campaignId: string, leadId: string) {
  const supabase = await sb();
  const role = await getCampaignRole(campaignId);
  if (!can(role, "canSend")) throw new Error("Unauthorized");

  await supabase
    .from("send_queue")
    .update({
      status: "queued",
      next_attempt_at: new Date().toISOString(),
      last_error: null,
      fail_code: null,
      fail_kind: null,
    })
    .eq("campaign_id", campaignId)
    .eq("lead_id", leadId)
    .eq("status", "failed");

  return { ok: true };
}

export async function cancelQueuedForLead(campaignId: string, leadId: string) {
  const supabase = await sb();
  const role = await getCampaignRole(campaignId);
  if (!can(role, "canSend")) throw new Error("Unauthorized");

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  await supabase
    .from("send_queue")
    .update({
      canceled_at: new Date().toISOString(),
      canceled_by: user.id,
    })
    .eq("campaign_id", campaignId)
    .eq("lead_id", leadId)
    .eq("status", "queued")
    .is("canceled_at", null);

  return { ok: true };
}

export async function setLeadTimezone(campaignId: string, leadId: string, tz: string) {
  const supabase = await sb();
  const role = await getCampaignRole(campaignId);
  if (!can(role, "canSend")) throw new Error("Unauthorized");

  await supabase
    .from("campaign_leads")
    .update({ timezone: tz || null })
    .eq("id", leadId)
    .eq("campaign_id", campaignId);

  return { ok: true };
}

export async function resendFromLog(campaignId: string, leadId: string, logId: string) {
  const supabase = await sb();
  const role = await getCampaignRole(campaignId);
  if (!can(role, "canSend")) throw new Error("Unauthorized");

  // Grab the snapshot
  const { data: log } = await supabase
    .from("send_logs")
    .select("id, subject_rendered, html_rendered, template_version_id, variant_key")
    .eq("id", logId)
    .eq("campaign_id", campaignId)
    .eq("lead_id", leadId)
    .maybeSingle();

  if (!log?.html_rendered) throw new Error("No snapshot available to resend");

  // Get sender_account_id from campaign
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("sender_account_id")
    .eq("id", campaignId)
    .maybeSingle();

  // Insert a queued job with force payload in meta
  await supabase.from("send_queue").insert({
    campaign_id: campaignId,
    lead_id: leadId,
    sender_account_id: campaign?.sender_account_id ?? null,
    status: "queued",
    scheduled_at: new Date().toISOString(),
    next_attempt_at: new Date().toISOString(),
    attempts: 0,
    priority: 10,
    variant_key: log.variant_key ?? "default",
    template_version_id: log.template_version_id ?? null,
    subject: log.subject_rendered ?? null,
    meta: {
      kind: "resend_snapshot",
      resend_of_log_id: log.id,
      force_subject: log.subject_rendered,
      force_html: log.html_rendered
    }
  });

  // Log activity
  await supabase.from("activity_logs").insert({
    campaign_id: campaignId,
    lead_id: leadId,
    actor_id: null,
    event_type: "resend_enqueued",
    meta: { resend_of_log_id: log.id }
  });

  return { ok: true };
}
