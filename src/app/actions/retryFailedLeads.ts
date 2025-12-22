"use server";

import { createSupabaseServer } from "@/lib/supabaseServer";

export async function retryFailedLeads(leadIds: string[]) {
  const supabase = createSupabaseServer();

  // Fetch leads and their campaign_id
  const { data: leads, error: leadsError } = await supabase
    .from("leads")
    .select("id, campaign_id")
    .in("id", leadIds);

  if (leadsError || !leads) {
    return { success: false, error: leadsError?.message || "Failed to fetch leads" };
  }

  // Re-queue leads for sending
  const queueInserts = leads.map((lead) => ({
    lead_id: lead.id,
    campaign_id: lead.campaign_id,
    status: "queued",
  }));

  const { error: queueError } = await supabase
    .from("send_queue")
    .insert(queueInserts);

  if (queueError) {
    return { success: false, error: queueError.message };
  }

  // Update lead status to "queued"
  const { error: updateError } = await supabase
    .from("leads")
    .update({ status: "queued" })
    .in("id", leadIds);

  if (updateError) {
    return { success: false, error: updateError.message };
  }

  return { success: true };
}
