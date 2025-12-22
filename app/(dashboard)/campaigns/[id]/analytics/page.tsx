import { createClient } from "@/utils/supabase/server";
import { fetchCampaignAnalytics } from "./fetch-analytics";
import { OverviewStatsV2 } from "./_components/OverviewStatsV2";
import { StepPerformanceCharts } from "./_components/StepPerformanceCharts";
import { OutcomeDistribution } from "./_components/OutcomeDistribution";
import { RevenueEstimator } from "./_components/RevenueEstimator";
import { LeadJourneysTable } from "./_components/LeadJourneysTable";
import { CampaignComparison } from "./_components/CampaignComparison";
import { ExportCampaignContacts } from "./_components/ExportCampaignContacts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const dynamic = "force-dynamic";

export default async function CampaignAnalyticsPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createClient();

  // Get campaign info
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, name")
    .eq("id", params.id)
    .single();

  if (!campaign) {
    return <div className="p-6">Campaign not found.</div>;
  }

  // Fetch analytics data
  let analytics;
  try {
    analytics = await fetchCampaignAnalytics(params.id);
  } catch (error) {
    console.error("Error fetching analytics:", error);
    // Return empty analytics on error
    analytics = {
      summary: {
        totalContacts: 0,
        delivered: 0,
        replies: 0,
        uniqueHotLeads: 0,
        warmLeads: 0,
        estimateRequests: 0,
        jobsWon: 0,
        estimatedRevenue: 0,
        replyRate: 0,
        hotRate: 0,
        warmRate: 0,
      },
      steps: [],
      contacts: [],
      outcomeDistribution: {
        hot: 0,
        warm: 0,
        notInterested: 0,
        noReply: 0,
        customer: 0,
      },
    };
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {campaign.name} – Analytics
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Campaign performance metrics, reply rates, hot lead generation, and revenue estimates.
          </p>
        </div>
        <ExportCampaignContacts campaignId={params.id} />
      </div>

      {/* Overview Stats */}
      <OverviewStatsV2 
        summary={analytics.summary} 
        comparison={analytics.comparison}
      />

      {/* Comparison Panel */}
      {analytics.comparison && (
        <CampaignComparison comparison={analytics.comparison} />
      )}

      {/* Main Content Tabs */}
      <Tabs defaultValue="performance" className="space-y-4">
        <TabsList>
          <TabsTrigger value="performance">Step Performance</TabsTrigger>
          <TabsTrigger value="outcomes">Outcomes</TabsTrigger>
          <TabsTrigger value="journeys">Lead Journeys</TabsTrigger>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
        </TabsList>

        <TabsContent value="performance" className="space-y-4">
          <StepPerformanceCharts steps={analytics.steps} />
        </TabsContent>

        <TabsContent value="outcomes" className="space-y-4">
          <OutcomeDistribution outcomeDistribution={analytics.outcomeDistribution} />
        </TabsContent>

        <TabsContent value="journeys" className="space-y-4">
          <LeadJourneysTable contacts={analytics.contacts} />
        </TabsContent>

        <TabsContent value="revenue" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <RevenueEstimator 
              summary={analytics.summary} 
              jobsWon={analytics.summary.jobsWon}
            />
            <OutcomeDistribution outcomeDistribution={analytics.outcomeDistribution} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
