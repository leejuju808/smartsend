// app/dashboard/campaigns/page.tsx

import { Metadata } from "next";
import { createClient } from "@/utils/supabase/server";
import CampaignsClient from "./_components/CampaignsClient";

export const metadata: Metadata = {
  title: "City outreach · SmartSend",
};

type CampaignRow = {
  id: string;
  workspace_id: string;
  name: string;
  description: string | null;
  status: string;
  created_at: string;
  from_name: string | null;
  from_email: string | null;
  daily_send_limit: number | null;
};

async function loadCampaigns(): Promise<CampaignRow[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("campaigns")
    .select(
      `
        id,
        workspace_id,
        name,
        description,
        status,
        created_at,
        from_name,
        from_email,
        daily_send_limit
      `
    )
    .order("created_at", { ascending: false })
    .limit(50);

  if (error || !data) {
    console.error("Error loading campaigns:", error);
    return [];
  }

  return data as CampaignRow[];
}

export default async function CampaignsPage() {
  const campaigns = await loadCampaigns();

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <CampaignsClient campaigns={campaigns} />
    </div>
  );
}

