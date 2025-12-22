"use server";

import { createClient } from "@/utils/supabase/server";

export type SegmentMin = {
  id: string;
  account_id: string;
  name: string;
  created_at: string;
};

export async function listSegmentsMin(accountId: string): Promise<SegmentMin[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("segments")
    .select("id, account_id, name, created_at")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as SegmentMin[];
}

