"use server";

import { createClient } from "@/lib/supabase/server";

export async function createSequenceStep(campaignId: string) {
  const supabase = createClient();

  // Find max position
  const { data: steps } = await supabase
    .from("smartsend_sequence_steps")
    .select("position")
    .eq("campaign_id", campaignId)
    .order("position", { ascending: false })
    .limit(1);

  const newPos = steps?.[0]?.position ? steps[0].position + 1 : 1;

  const { data, error } = await supabase
    .from("smartsend_sequence_steps")
    .insert({
      campaign_id: campaignId,
      position: newPos,
      delay_days: newPos === 1 ? 0 : 3, // default delay
      subject: "",
      body: "",
    })
    .select()
    .single();

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, data };
}








