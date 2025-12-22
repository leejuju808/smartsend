"use client";

import { use } from "react";
import useSWR from "swr";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import OverviewTab from "./tabs/overview";
import TimelineTab from "./tabs/timeline";
import CampaignsTab from "./tabs/campaigns";
import EmailsTab from "./tabs/emails";
import AttributesTab from "./tabs/attributes";
import TagsTab from "./tabs/tags";
import EnrichmentTab from "./tabs/enrichment";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function LeadProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, error, isLoading } = useSWR(`/api/leads/${id}`, fetcher);

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          <div className="h-4 bg-gray-200 rounded w-1/4"></div>
        </div>
      </div>
    );
  }

  if (error || !data || !data.lead) {
    return (
      <div className="p-6">
        <div className="text-red-600">Failed to load lead profile</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">
          {data.lead.first_name || ""} {data.lead.last_name || ""}
        </h1>
        <p className="text-muted-foreground">{data.lead.email}</p>
      </div>

      <Tabs defaultValue="overview" className="mt-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
          <TabsTrigger value="emails">Emails</TabsTrigger>
          <TabsTrigger value="attributes">Attributes</TabsTrigger>
          <TabsTrigger value="tags">Tags</TabsTrigger>
          <TabsTrigger value="enrichment">Enrichment</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab data={data} />
        </TabsContent>

        <TabsContent value="timeline">
          <TimelineTab timeline={data.timeline || []} />
        </TabsContent>

        <TabsContent value="campaigns">
          <CampaignsTab campaigns={data.campaigns || []} leadId={id} />
        </TabsContent>

        <TabsContent value="emails">
          <EmailsTab events={data.emails || []} />
        </TabsContent>

        <TabsContent value="attributes">
          <AttributesTab lead={data.lead} />
        </TabsContent>

        <TabsContent value="tags">
          <TagsTab lead={data.lead} tags={data.tags || []} />
        </TabsContent>

        <TabsContent value="enrichment">
          <EnrichmentTab leadId={id} enrichment={data.enrichment} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

