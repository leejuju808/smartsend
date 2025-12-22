"use client";

import * as React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type CampaignMoneyRow = {
  campaign_id: string;
  campaign_name: string;
  leads_count: number;
  hot_leads: number;
  warm_leads: number;
  not_interested_leads: number;
  pipeline_value: number;
  booked_value: number;
  hot_rate_percent: number;
  opp_rate_percent: number;
};

export function CampaignMoneyTable() {
  const [rows, setRows] = React.useState<CampaignMoneyRow[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch("/api/owner/campaigns-money");
        if (!res.ok) throw new Error("Failed to load campaigns");
        const json = await res.json();
        setRows(json.data ?? []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Campaign Money View</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground">
          Loading campaign performance…
        </CardContent>
      </Card>
    );
  }

  if (!rows.length) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Campaign Money View</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground">
          No campaigns with tracked leads yet. Once you start sending, each
          campaign's leads and booked value will show up here.
        </CardContent>
      </Card>
    );
  }

  const formatMoney = (v: number) => `$${Math.round(v).toLocaleString()}`;

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Campaign Money View</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="min-w-full border-collapse text-xs">
          <thead>
            <tr className="border-b text-[11px] text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">Campaign</th>
              <th className="px-3 py-2 text-right font-medium">Leads</th>
              <th className="px-3 py-2 text-right font-medium">Hot</th>
              <th className="px-3 py-2 text-right font-medium">Warm</th>
              <th className="px-3 py-2 text-right font-medium">Booked $</th>
              <th className="px-3 py-2 text-right font-medium">Pipeline $</th>
              <th className="px-3 py-2 text-right font-medium">Hot %</th>
              <th className="px-3 py-2 text-right font-medium">Opp %</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.campaign_id}
                className="border-b last:border-0 hover:bg-muted/40"
              >
                <td className="px-3 py-2 text-left">
                  <div className="flex flex-col">
                    <span className="text-[13px] font-medium">
                      {row.campaign_name}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {row.leads_count} leads · {row.hot_leads} hot ·{" "}
                      {row.warm_leads} warm
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2 text-right">{row.leads_count}</td>
                <td className="px-3 py-2 text-right text-emerald-600">
                  {row.hot_leads}
                </td>
                <td className="px-3 py-2 text-right text-amber-600">
                  {row.warm_leads}
                </td>
                <td className="px-3 py-2 text-right font-semibold">
                  {formatMoney(row.booked_value)}
                </td>
                <td className="px-3 py-2 text-right">
                  {formatMoney(row.pipeline_value)}
                </td>
                <td className="px-3 py-2 text-right">
                  {row.hot_rate_percent.toFixed(1)}%
                </td>
                <td className="px-3 py-2 text-right">
                  {row.opp_rate_percent.toFixed(1)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="mt-3 text-[11px] text-muted-foreground">
          Use this to see which campaigns are actually creating hot & warm
          opportunities and booked revenue — and which ones you should pause
          or double down on.
        </p>
      </CardContent>
    </Card>
  );
}











































