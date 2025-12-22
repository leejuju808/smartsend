import CampaignAnalytics from "@/components/CampaignAnalytics";

interface CampaignAnalyticsPageProps {
  params: { id: string };
}

export default function CampaignAnalyticsPage({ params }: CampaignAnalyticsPageProps) {
  return (
    <main className="mx-auto max-w-7xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Campaign Analytics</h1>
        <p className="text-sm text-gray-500 mt-1">View performance metrics and insights for your campaign</p>
      </div>
      <CampaignAnalytics campaignId={params.id} />
    </main>
  );
} 