import { CampaignMembersCard } from "./CampaignMembersCard";

export default function Page({ params }: { params: { id: string } }) {
  return <CampaignMembersCard campaignId={params.id} />;
}


