// app/dashboard/campaigns/[id]/sequence/page.tsx

import { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import CampaignSequenceClient from "../../_components/CampaignSequenceClient";

export const metadata: Metadata = {
  title: "Campaign Sequence · SmartSend",
};

type Campaign = {
  id: string;
  workspace_id: string;
  name: string;
  status: string;
  created_at: string;
};

type StepRow = {
  id: string;
  campaign_id: string;
  step_order: number;
  delay_days: number;
  subject: string;
  body: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

interface SequencePageProps {
  params: { id: string };
}

async function loadCampaign(id: string): Promise<Campaign | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("campaigns")
    .select("id, workspace_id, name, status, created_at")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("Error loading campaign:", error);
    return null;
  }

  return (data as Campaign) ?? null;
}

async function loadSteps(campaignId: string): Promise<StepRow[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("campaign_steps")
    .select(
      `
        id,
        campaign_id,
        step_order,
        delay_days,
        subject,
        body,
        enabled,
        created_at,
        updated_at
      `
    )
    .eq("campaign_id", campaignId)
    .order("step_order", { ascending: true });

  if (error || !data) {
    console.error("Error loading campaign steps:", error);
    return [];
  }

  return data as StepRow[];
}

export default async function CampaignSequencePage({
  params,
}: SequencePageProps) {
  const [campaign, steps] = await Promise.all([
    loadCampaign(params.id),
    loadSteps(params.id),
  ]);

  if (!campaign) {
    notFound();
  }

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <CampaignSequenceClient campaign={campaign} steps={steps} />
    </div>
  );
}


























































