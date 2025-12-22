import { CampaignFollowupsForm } from "@/app/(dash)/campaigns/[id]/settings/followups/CampaignFollowupsForm";

export const dynamic = "force-dynamic";

export default function Page({ params }: { params: { id: string } }) {
  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <CampaignFollowupsForm campaignId={params.id} />
    </div>
  );
}


