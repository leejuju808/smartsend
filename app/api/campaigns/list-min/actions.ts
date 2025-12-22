"use server";

import { createClient } from "@/utils/supabase/server";

export type CampaignMin = {
  id: string;
  account_id: string;
  name: string;
  status: string | null;
  created_at: string;
};

export async function listCampaignsMin(accountId: string): Promise<CampaignMin[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("campaigns")
    .select("id, account_id, name, status, created_at")
    .eq("account_id", accountId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as CampaignMin[];
}













