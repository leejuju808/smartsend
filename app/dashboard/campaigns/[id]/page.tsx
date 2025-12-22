// app/dashboard/campaigns/[id]/page.tsx

import { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import CampaignDetailClient from "../_components/CampaignDetailClient";

export const metadata: Metadata = {
  title: "Campaign · SmartSend",
};

type Campaign = {
  id: string;
  workspace_id: string;
  name: string;
  status: string;
  created_at: string;
};

type CampaignPerfRow = {
  campaign_id: string;
  workspace_id: string;
  campaign_name: string;
  campaign_status: string;
  campaign_created_at: string;
  replies_count: number;
  leads_count: number;
  pipeline_value: string; // numeric as text
  won_value: string;      // numeric as text
};

type LeadStatus = "new" | "in_progress" | "won" | "lost";

type LeadRow = {
  id: string;
  name: string | null;
  email: string | null;
  subject: string | null;
  status: LeadStatus;
  estimated_value: number | null;
  currency: string;
  created_at: string;
};

type IntentType = "hot" | "warm" | "not_interested" | "unclassified";

type ReplyRow = {
  id: string;
  from_email: string | null;
  from_name: string | null;
  subject: string | null;
  preview: string | null;
  received_at: string | null;
  intent: IntentType | null;
  confidence: number | null;
};

interface CampaignPageProps {
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

async function loadCampaignStats(
  id: string
): Promise<CampaignPerfRow | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("campaign_performance_view")
    .select(
      `
      campaign_id,
      workspace_id,
      campaign_name,
      campaign_status,
      campaign_created_at,
      replies_count,
      leads_count,
      pipeline_value,
      won_value
    `
    )
    .eq("campaign_id", id)
    .maybeSingle();

  if (error) {
    console.error("Error loading campaign performance:", error);
    return null;
  }

  return (data as CampaignPerfRow) ?? null;
}

async function loadCampaignLeads(id: string): Promise<LeadRow[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("leads")
    .select(
      `
      id,
      name,
      email,
      subject,
      status,
      estimated_value,
      currency,
      created_at,
      campaign_id
    `
    )
    .eq("campaign_id", id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error || !data) {
    console.error("Error loading campaign leads:", error);
    return [];
  }

  return data as LeadRow[];
}

async function loadCampaignReplies(id: string): Promise<ReplyRow[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("reply_intents_view")
    .select(
      `
      id,
      from_email,
      from_name,
      subject,
      preview,
      received_at,
      intent,
      confidence,
      workspace_id,
      thread_id
    `
    )
    .eq("campaign_id", id)
    .order("received_at", { ascending: false })
    .limit(50);

  if (error || !data) {
    console.error("Error loading campaign replies:", error);
    return [];
  }

  return data as ReplyRow[];
}

export default async function CampaignDetailPage({
  params,
}: CampaignPageProps) {
  const [campaign, stats, leads, replies] = await Promise.all([
    loadCampaign(params.id),
    loadCampaignStats(params.id),
    loadCampaignLeads(params.id),
    loadCampaignReplies(params.id),
  ]);

  if (!campaign) {
    notFound();
  }

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <CampaignDetailClient
        campaign={campaign}
        stats={stats}
        leads={leads}
        replies={replies}
      />
    </div>
  );
}
