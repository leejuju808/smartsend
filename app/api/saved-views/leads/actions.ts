"use server";

import { z } from "zod";
import { createClient } from "@/src/utils/supabase/server";
import { requireUserAndAccount } from "@/lib/supabase/server";

const leadSavedViewSchema = z.object({
  id: z.string().uuid().optional(),      // existing view for update
  account_id: z.string().uuid(),
  owner_id: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  config: z.any(),                       // JSON filter payload
});

export type LeadSavedViewInput = z.infer<typeof leadSavedViewSchema>;

export async function saveLeadSavedView(input: LeadSavedViewInput) {
  const supabase = createClient();
  const { user, account } = await requireUserAndAccount(supabase);
  
  const payload = leadSavedViewSchema.parse(input);

  // Ensure the user owns the account or is authorized
  if (payload.account_id !== account.id) {
    throw new Error("Unauthorized: account_id mismatch");
  }

  const base = {
    account_id: payload.account_id,
    owner_id: payload.owner_id,
    scope: "account" as const,          // or "campaign" if you later do per-campaign
    campaign_id: null,
    kind: "saved_view" as const,
    entity: "leads" as const,
    name: payload.name,
    description: payload.description ?? null,
    config: payload.config,
    status: "active" as const,
  };

  if (payload.id) {
    const { data, error } = await supabase
      .from("shared_resources")
      .update(base)
      .eq("id", payload.id)
      .eq("kind", "saved_view")
      .eq("entity", "leads")
      .eq("account_id", payload.account_id)
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

export async function listLeadSavedViews(accountId: string) {
  const supabase = createClient();
  const { account } = await requireUserAndAccount(supabase);

  // Ensure the user has access to this account
  if (accountId !== account.id) {
    throw new Error("Unauthorized: account_id mismatch");
  }

  const { data, error } = await supabase
    .from("shared_resources")
    .select("id, name, description, config, created_at, owner_id")
    .eq("account_id", accountId)
    .eq("kind", "saved_view")
    .eq("entity", "leads")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}














