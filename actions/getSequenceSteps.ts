"use server";

import { createClient } from "@/lib/supabase/server";

export async function getSequenceSteps(campaignId: string) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("smartsend_sequence_steps")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("position", { ascending: true });

  if (error) {
    return { ok: false, error: error.message, data: [] };
  }

  return { ok: true, data: data || [] };
}

export { createSequenceStep } from "./createSequenceStep";
export { updateSequenceStep } from "./updateSequenceStep";
export { deleteSequenceStep } from "./deleteSequenceStep";

