// app/(dashboard)/campaigns/[id]/delivery/page.tsx
// Block 8140 — Campaign delivery view

import { getCampaignSendStats, getCampaignRecipients } from "@/lib/smartsend/campaign-send";
import { CampaignSendSummary } from "@/components/campaign/CampaignSendSummary";
import { CampaignRecipientsTable } from "@/components/campaign/CampaignRecipientsTable";
import { RunSendEngineButton } from "@/components/campaign/RunSendEngineButton";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function CampaignDeliveryPage({ params }: PageProps) {
  const { id: campaignId } = await params;

  const [stats, recipients] = await Promise.all([
    getCampaignSendStats(campaignId),
    getCampaignRecipients(campaignId, { limit: 100 }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-lg font-semibold tracking-tight">
          Campaign Delivery
        </h1>
        <RunSendEngineButton size="sm" />
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1.5fr)]">
        <CampaignSendSummary stats={stats} />
        <div className="rounded-xl border border-dashed px-4 py-3 text-xs text-muted-foreground">
          Provider diagnostics / reply stats placeholder.
        </div>
      </div>

      <CampaignRecipientsTable rows={recipients} />
    </div>
  );
}

