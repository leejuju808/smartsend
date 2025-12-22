"use server";

import { createClient } from "@/lib/supabase/server";

export async function deleteSequenceStep(stepId: string) {
  const supabase = createClient();

  const { error } = await supabase
    .from("smartsend_sequence_steps")
    .delete()
    .eq("id", stepId);

  if (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true };
}








