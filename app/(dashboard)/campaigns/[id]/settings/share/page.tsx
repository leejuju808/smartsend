"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CampaignSharingCard } from "@/components/campaigns/CampaignSharingCard";

export default function CampaignSettingsSharingPage() {
  const params = useParams();
  const id = params.id as string;

  const [campaign, setCampaign] = useState<{ is_shared: boolean } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    // load campaign
    const resCamp = await fetch(`/api/campaigns/${id}`);
    const jsonCamp = await resCamp.json();
    setCampaign(jsonCamp.campaign);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [id]);

  if (loading || !campaign) return <div className="p-6 text-sm">Loading…</div>;

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Campaign Settings</h1>
      <CampaignSharingCard campaignId={id} initialIsShared={campaign.is_shared ?? true} />
    </div>
  );
}
