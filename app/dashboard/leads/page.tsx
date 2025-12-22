// app/dashboard/leads/page.tsx

import { Metadata } from "next";
import { createClient } from "@/utils/supabase/server";
import LeadsClient from "./_components/LeadsClient";

export const metadata: Metadata = {
  title: "Leads · SmartSend",
};

type LeadRow = {
  id: string;
  workspace_id: string;
  contact_id: string | null;
  email: string | null;
  name: string | null;
  status: string;
  source: string | null;
  estimated_value: number | null;
  currency: string | null;
  created_at: string;
  latest_intent: string | null;
  latest_reply_at: string | null;
  reply_count: number | null;
};

async function loadLeads(): Promise<LeadRow[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("leads_with_reply_meta")
    .select(
      `
      id,
      workspace_id,
      contact_id,
      email,
      name,
      status,
      source,
      estimated_value,
      currency,
      created_at,
      latest_intent,
      latest_reply_at,
      reply_count
    `
    )
    .order("created_at", { ascending: false })
    .limit(200);

  if (error || !data) {
    console.error("Error loading leads:", error);
    return [];
  }

  return data as LeadRow[];
}

export default async function LeadsPage() {
  const leads = await loadLeads();

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <LeadsClient leads={leads} />
    </div>
  );
}
