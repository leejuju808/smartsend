"use client";

import useSWR from "swr";
import { Card, CardContent } from "@/components/ui/card";
import { CampaignHourHeatmap } from "@/components/charts/campaign-hour-heatmap";
import { CampaignDowHeatmap } from "@/components/charts/campaign-dow-heatmap";
import { VariantTable } from "@/components/campaigns/variant-table";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function CampaignSummary({
  params,
}: {
  params: { id: string };
}) {
  const { data, error, isLoading } = useSWR(
    `/api/campaigns/${params.id}/summary`,
    fetcher
  );

  const { data: variantData, error: variantError } = useSWR(
    `/api/campaigns/${params.id}/variants/summary`,
    fetcher
  );

  if (isLoading) return <div className="p-6">Loading…</div>;
  if (error) return <div className="p-6 text-red-600">Error loading data</div>;
  if (!data) return <div className="p-6">No data available</div>;

  const { sent, delivered, opens, clicks, replies, bounces, intents, variants, heatmap, heatmap_hour, heatmap_dow } =
    data;
  
  const variantStats = variantData?.variants || [];

  return (
    <div className="space-y-6 max-w-5xl mx-auto py-6">
      <h1 className="text-2xl font-bold">Campaign Summary</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
        <Stat title="Sent" value={sent} />
        <Stat title="Delivered" value={delivered} />
        <Stat title="Opened" value={opens} />
        <Stat title="Clicked" value={clicks} />
        <Stat title="Replies" value={replies} />
        <Stat title="Bounces" value={bounces} />
      </div>

      {/* Intent breakdown */}
      <Card>
        <CardContent className="p-4">
          <h2 className="font-semibold mb-3">Intent Breakdown</h2>
          {intents && intents.length > 0 ? (
            <ul className="space-y-2 text-sm">
              {intents.map((i: { intent_primary: string; count: number }) => (
                <li key={i.intent_primary}>
                  {i.intent_primary}: {i.count}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm opacity-60">No intent data available</p>
          )}
        </CardContent>
      </Card>

      {/* Variant stats */}
      <Card>
        <CardContent className="p-4">
          <h2 className="font-semibold mb-3">Variant Performance</h2>
          {variantStats.length > 0 ? (
            <VariantTable variants={variantStats} />
          ) : (
            <p className="text-sm opacity-60">No variant data available</p>
          )}
        </CardContent>
      </Card>

      {/* Heatmap v2 */}
      <Card>
        <CardContent className="p-4">
          <h2 className="font-semibold mb-4">Engagement Heatmap</h2>
          {heatmap_hour && heatmap_hour.length > 0 && (
            <CampaignHourHeatmap data={heatmap_hour} />
          )}
          {heatmap_dow && heatmap_dow.length > 0 && (
            <div className="mt-6">
              <CampaignDowHeatmap data={heatmap_dow} />
            </div>
          )}
          {(!heatmap_hour || heatmap_hour.length === 0) && (!heatmap_dow || heatmap_dow.length === 0) && (
            <p className="text-sm opacity-60">No heatmap data available yet</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ title, value }: { title: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4 text-center">
        <p className="text-sm opacity-60">{title}</p>
        <p className="text-xl font-bold">{value ?? 0}</p>
      </CardContent>
    </Card>
  );
}

