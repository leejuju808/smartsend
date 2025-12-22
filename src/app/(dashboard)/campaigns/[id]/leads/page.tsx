"use client";

import { LeadsTable } from "@/components/leads/LeadsTable";

export default function LeadsPage({ params }: { params: { id: string } }) {
  return (
    <div className="max-w-6xl mx-auto space-y-6 p-6">
      <LeadsTable defaultCampaignId={params.id} />
    </div>
  );
}


