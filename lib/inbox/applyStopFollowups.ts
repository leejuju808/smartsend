import { createClient } from "@/lib/supabase/server";

export async function applyStopFollowupsForReply(replyId: string) {
  const supabase = createClient();

  // 1) Fetch reply with lead_id
  const { data: reply, error: replyErr } = await supabase
    .from("reply_logs")
    .select("id, workspace_id, lead_id")
    .eq("id", replyId)
    .maybeSingle();

  if (replyErr) {
    console.error("[applyStopFollowups] reply fetch error", replyErr);
    return { ok: false as const, reason: "reply_fetch_failed" as const };
  }

  if (!reply) {
    return { ok: false as const, reason: "reply_not_found" as const };
  }

  if (!reply.lead_id) {
    return { ok: false as const, reason: "no_lead_id" as const };
  }

  // 2) Get the lead's email from the lead_id
  const { data: lead, error: leadErr } = await supabase
    .from("leads")
    .select("id, email")
    .eq("id", reply.lead_id)
    .maybeSingle();

  if (leadErr) {
    console.error("[applyStopFollowups] lead fetch error", leadErr);
    return { ok: false as const, reason: "lead_fetch_failed" as const };
  }

  if (!lead || !lead.email) {
    return { ok: false as const, reason: "no_lead_email" as const };
  }

  // 3) Find all matching leads in the workspace with the same email
  const { data: leads, error: leadsErr } = await supabase
    .from("leads")
    .select("id")
    .eq("workspace_id", reply.workspace_id)
    .eq("email", lead.email);

  if (leadsErr) {
    console.error("[applyStopFollowups] leads fetch error", leadsErr);
    return { ok: false as const, reason: "leads_fetch_failed" as const };
  }

  if (!leads || leads.length === 0) {
    return { ok: false as const, reason: "no_matching_leads" as const };
  }

  const leadIds = leads.map((l) => l.id);

  // 4) Set stop_followups = true and last_reply_id = reply.id on those leads
  const { error: updateLeadsErr } = await supabase
    .from("leads")
    .update({
      stop_followups: true,
      last_reply_id: reply.id,
    })
    .in("id", leadIds);

  if (updateLeadsErr) {
    console.error("[applyStopFollowups] leads update error", updateLeadsErr);
    return { ok: false as const, reason: "leads_update_failed" as const };
  }

  // 5) Cancel pending followup sends in queue for those leads
  // Cancel all pending sends for these leads (both initial sends and followups)
  // The dispatcher will also check stop_followups flag, but canceling here prevents them from being sent
  const { error: queueErr } = await supabase
    .from("send_queue")
    .update({ status: "canceled" })
    .eq("workspace_id", reply.workspace_id)
    .in("lead_id", leadIds)
    .in("status", ["pending", "queued", "waiting_approval"]);

  if (queueErr) {
    console.error("[applyStopFollowups] send_queue update error", queueErr);
    // not fatal for the lead flag, but good to know
    return {
      ok: true as const,
      reason: "queue_update_failed" as const,
      leadIds,
    };
  }

  return { ok: true as const, reason: null, leadIds };
}

