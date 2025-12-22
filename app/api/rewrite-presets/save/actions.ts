"use server";

import { createClient } from "@/utils/supabase/server";
import {
  rewritePresetSchema,
  type RewritePresetInput,
} from "@/lib/templates/rewrite-schema";

export async function saveRewritePreset(input: RewritePresetInput) {
  const supabase = createClient();
  const payload = rewritePresetSchema.parse(input);

  const base = {
    account_id: payload.account_id,
    owner_id: payload.owner_id,
    scope: "account" as const,
    campaign_id: null,
    kind: "rewrite_preset",
    entity: "emails",
    name: payload.name,
    description: payload.description ?? null,
    status: "active",
    config: payload.config,
  };

  if (payload.id) {
    const { data, error } = await supabase
      .from("shared_resources")
      .update(base)
      .eq("id", payload.id)
      .eq("kind", "rewrite_preset")
      .select("*")
      .single();

    if (error) throw error;
    return data;
  } else {
    const { data, error } = await supabase
      .from("shared_resources")
      .insert(base)
      .select("*")
      .single();

    if (error) throw error;
    return data;
  }
}













