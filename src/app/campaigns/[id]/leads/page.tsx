import CampaignLeadsClient from "./CampaignLeadsClient";

export default async function CampaignLeadsPage({ params }: { params: { id: string } }) {
  return <CampaignLeadsClient campaignId={params.id} />;
}









