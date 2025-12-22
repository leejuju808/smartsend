// app/(dashboard)/campaigns/[campaignId]/page.tsx

import { cookies } from "next/headers";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { CampaignStatusBar } from "./CampaignStatusBar";
import { CampaignSequenceEditor, SequenceStep } from "./CampaignSequenceEditor";
import { CampaignLeadImporter } from "./CampaignLeadImporter";
import { CampaignEnqueueButton } from "./CampaignEnqueueButton";

interface CampaignPageProps {
  params: { campaignId: string };
}

export default async function CampaignPage({ params }: CampaignPageProps) {
  const { campaignId } = params;
  const supabase = createServerComponentClient({ cookies });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-neutral-400">
        Please sign in to view this campaign.
      </div>
    );
  }

  const { data: campaign, error } = await supabase
    .from("campaigns")
    .select("id, name, goal, status, sequence, created_at")
    .eq("id", campaignId)
    .eq("owner_id", user.id)
    .single();

  if (error || !campaign) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-red-400">
        Campaign not found.
      </div>
    );
  }

  const sequence = (campaign.sequence as SequenceStep[]) ?? [];

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold text-neutral-50">
            {campaign.name || "Untitled Campaign"}
          </h1>
          {campaign.goal && (
            <p className="text-sm text-neutral-400">
              Goal: {campaign.goal}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <div className="text-xs text-neutral-400">
            Status: <span className="text-neutral-200 font-semibold">{campaign.status || "draft"}</span>
          </div>
          {campaign.status === "queued" && (
            <p className="text-xs text-emerald-400">Emails scheduled. SmartSend is sending automatically.</p>
          )}
        </div>

        <CampaignStatusBar
          campaignId={campaign.id}
          initialStatus={(campaign.status as "draft" | "active" | "paused" | "queued") ?? "draft"}
          createdAt={campaign.created_at || new Date().toISOString()}
        />
      </header>

      <main className="flex flex-col gap-6">
        <CampaignSequenceEditor
          campaignId={campaign.id}
          initialSequence={sequence}
        />

        <CampaignLeadImporter campaignId={campaign.id} />

        <CampaignEnqueueButton campaignId={campaign.id} />
      </main>
    </div>
  );
}

