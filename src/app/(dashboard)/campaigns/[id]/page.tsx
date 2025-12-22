import { getStepFunnel } from "@/lib/db/funnel";
import CampaignDashboard from "./dashboard";

export default async function Page({ params }: { params: { id: string } }) {
  const funnel = await getStepFunnel(params.id);
  return <CampaignDashboard id={params.id} funnelRows={funnel} />;
}
