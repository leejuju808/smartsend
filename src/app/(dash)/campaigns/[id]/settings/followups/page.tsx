import { CampaignFollowupsForm } from "./CampaignFollowupsForm";

export default function Page({ params }: { params: { id: string } }) {
  return (
    <div className="space-y-6">
      <CampaignFollowupsForm campaignId={params.id} />
      <p className="text-sm text-muted-foreground">
        Nudges run automatically via your followups worker. Review drafts in the Replies tab if auto-send is off.
      </p>
    </div>
  );
}


