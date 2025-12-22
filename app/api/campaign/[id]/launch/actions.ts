"use server";

import { createClient } from "@/utils/supabase/server";
import { filterLeadsBySegment } from "@/utils/segments/filter";

type LaunchResult = {
  ok: boolean;
  enqueued: number;
  skipped_no_email: number;
  skipped_unreachable: number;
  skipped_existing: number;
};

export async function launchCampaign(campaignId: string): Promise<LaunchResult> {
  const supabase = createClient();

  // 1) Load campaign (need account_id + segment_id)
  const { data: campaign, error: campaignError } = await supabase
    .from("campaigns")
    .select("id, account_id, name, segment_id")
    .eq("id", campaignId)
    .single();

  if (campaignError || !campaign) {
    throw new Error("Campaign not found");
  }

  if (!campaign.segment_id) {
    throw new Error("Campaign has no segment attached");
  }

  // 2) Resolve segment → candidate leads using same helper as preview
  const allLeads = await filterLeadsBySegment(
    campaign.account_id,
    campaign.segment_id
  );

  if (!allLeads || allLeads.length === 0) {
    return {
      ok: true,
      enqueued: 0,
      skipped_no_email: 0,
      skipped_unreachable: 0,
      skipped_existing: 0,
    };
  }

  // 3) Filter out leads without email or already unsubscribed/bounced
  const withEmail = allLeads.filter(
    (l: any) => l.email && String(l.email).trim() !== ""
  );

  const reachable = withEmail.filter((l: any) => {
    const status = l.email_status as
      | "active"
      | "replied"
      | "unsubscribed"
      | "bounced"
      | null
      | undefined;
    if (!status) return true;
    if (status === "unsubscribed" || status === "bounced") return false;
    return true;
  });

  const allLeadIds = allLeads.map((l: any) => l.id as string);
  const withEmailIds = withEmail.map((l: any) => l.id as string);
  const reachableIds = reachable.map((l: any) => l.id as string);

  const skipped_no_email = allLeadIds.length - withEmailIds.length;
  const skipped_unreachable = withEmailIds.length - reachableIds.length;

  if (reachableIds.length === 0) {
    return {
      ok: true,
      enqueued: 0,
      skipped_no_email,
      skipped_unreachable,
      skipped_existing: 0,
    };
  }

  // 4) Avoid double-sending to leads that already have send_logs for this campaign
  const { data: existingLogs, error: existingError } = await supabase
    .from("send_logs")
    .select("lead_id")
    .eq("campaign_id", campaign.id)
    .in("lead_id", reachableIds);

  if (existingError) {
    throw existingError;
  }

  const alreadyLeadIds = new Set(
    (existingLogs ?? []).map((r: any) => r.lead_id as string)
  );

  const finalLeadIds = reachableIds.filter((id) => !alreadyLeadIds.has(id));
  const skipped_existing = reachableIds.length - finalLeadIds.length;

  if (finalLeadIds.length === 0) {
    return {
      ok: true,
      enqueued: 0,
      skipped_no_email,
      skipped_unreachable,
      skipped_existing,
    };
  }

  // 5) Enqueue into send_queue for quota-aware dispatcher
  const rows = finalLeadIds.map((leadId) => ({
    account_id: campaign.account_id,
    campaign_id: campaign.id,
    lead_id,
    status: "pending" as const,
  }));

  const { error: insertError } = await supabase
    .from("send_queue")
    .insert(rows);

  if (insertError) {
    throw insertError;
  }

  return {
    ok: true,
    enqueued: rows.length,
    skipped_no_email,
    skipped_unreachable,
    skipped_existing,
  };
}

