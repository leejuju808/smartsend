"use server";

import { createClient } from "@/utils/supabase/server";
import { segmentSchema, SegmentInput } from "@/lib/segments/schema";

export type SaveSegmentInput = SegmentInput;

export async function saveSegment(input: SaveSegmentInput) {
  const supabase = createClient();
  const payload = segmentSchema.parse(input);

  const base = {
    account_id: payload.account_id,
    owner_id: payload.owner_id,
    name: payload.name,
    description: payload.description ?? null,
    conditions: payload.conditions,
  };

  if (payload.id) {
    const { data, error } = await supabase
      .from("segments")
      .update(base)
      .eq("id", payload.id)
      .select("*")
      .single();

    if (error) throw error;
    return data;
  } else {
    const { data, error } = await supabase
      .from("segments")
      .insert(base)
      .select("*")
      .single();

    if (error) throw error;
    return data;
  }
}
