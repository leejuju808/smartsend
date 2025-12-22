"use server";

import { createClient } from "@/utils/supabase/server";
import type { RewritePresetConfig } from "@/lib/templates/rewrite-schema";

export type RewritePresetRow = {
  id: string;
  account_id: string;
  owner_id: string;
  name: string;
  description: string | null;
  config: RewritePresetConfig;
  created_at: string;
};

export async function listRewritePresets(accountId: string): Promise<RewritePresetRow[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("shared_resources")
    .select("id, account_id, owner_id, name, description, config, created_at")
    .eq("account_id", accountId)
    .eq("kind", "rewrite_preset")
    .eq("entity", "emails")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as RewritePresetRow[];
}













