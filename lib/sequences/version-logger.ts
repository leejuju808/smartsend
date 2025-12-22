// lib/sequences/version-logger.ts
// Helper function to log sequence version snapshots

import { createClient } from "@/lib/supabase/server";

export async function logSequenceVersion(
  sequenceId: string,
  campaignId: string | null,
  editorId: string,
  changeType: string = "edit"
) {
  const supabase = createClient();

  // Fetch full sequence object
  const { data: sequence, error: seqError } = await supabase
    .from("sequences")
    .select("*")
    .eq("id", sequenceId)
    .single();

  if (seqError || !sequence) {
    console.error("Failed to fetch sequence for version logging:", seqError);
    return;
  }

  // Fetch all steps - order by position or step_order depending on schema
  // Try position first (most common), fallback to step_order
  let steps: any[] | null = null;
  
  const { data: stepsByPosition, error: posError } = await supabase
    .from("sequence_steps")
    .select("*")
    .eq("sequence_id", sequenceId)
    .order("position", { ascending: true });
  
  if (!posError && stepsByPosition) {
    steps = stepsByPosition;
  } else {
    // Try step_order as fallback
    const { data: stepsByOrder, error: orderError } = await supabase
      .from("sequence_steps")
      .select("*")
      .eq("sequence_id", sequenceId)
      .order("step_order", { ascending: true });
    
    if (orderError) {
      console.error("Failed to fetch steps for version logging:", orderError);
      return;
    }
    steps = stepsByOrder;
  }

  // Create full snapshot
  const snapshot = {
    sequence,
    steps: steps || [],
    snapshot_at: new Date().toISOString(),
  };

  // Insert version record
  const { error: insertError } = await supabase
    .from("sequence_versions")
    .insert({
      sequence_id: sequenceId,
      campaign_id: campaignId,
      editor_id: editorId,
      snapshot: snapshot as any,
      change_type: changeType,
    });

  if (insertError) {
    console.error("Failed to log sequence version:", insertError);
  }
}

