"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { createClient } from "@/utils/supabase/client";

interface VariantStats {
  variant_id: string;
  name: string;
  sends: number;
  opens: number;
  clicks: number;
  replies: number;
  meetings?: number;
  open_rate: number;
  click_rate: number;
  reply_rate: number;
  meeting_rate?: number;
  is_winner: boolean;
}

interface VariantPerformanceTableProps {
  campaignId: string;
}

export function VariantPerformanceTable({
  campaignId,
}: VariantPerformanceTableProps) {
  const [variants, setVariants] = useState<VariantStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchVariantStats() {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("variant_stats")
        .select("*")
        .eq("campaign_id", campaignId)
        .order("name", { ascending: true });

      if (error) {
        console.error("Error fetching variant stats:", error);
        setLoading(false);
        return;
      }

      // Calculate rates (use existing rates from view if available, otherwise calculate)
      const statsWithRates = (data || []).map((v: any) => ({
        ...v,
        open_rate: v.open_rate ?? (v.sends > 0 ? (v.opens / v.sends) * 100 : 0),
        click_rate: v.click_rate ?? (v.sends > 0 ? (v.clicks / v.sends) * 100 : 0),
        reply_rate: v.reply_rate ?? (v.sends > 0 ? (v.replies / v.sends) * 100 : 0),
        meeting_rate: v.meetings && v.sends > 0 ? (v.meetings / v.sends) * 100 : 0,
      }));

      setVariants(statsWithRates);
      setLoading(false);
    }

    fetchVariantStats();
  }, [campaignId]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>A/B Variant Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  if (variants.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>A/B Variant Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">
            No variant data available
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>A/B Variant Performance</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left p-2 font-semibold">Variant</th>
                <th className="text-right p-2 font-semibold">Sends</th>
                <th className="text-right p-2 font-semibold">Opens %</th>
                <th className="text-right p-2 font-semibold">Clicks %</th>
                <th className="text-right p-2 font-semibold">Replies %</th>
                <th className="text-right p-2 font-semibold">Meetings %</th>
                <th className="text-center p-2 font-semibold">Winner?</th>
              </tr>
            </thead>
            <tbody>
              {variants.map((variant) => (
                <tr key={variant.variant_id} className="border-b">
                  <td className="p-2 font-medium">{variant.name}</td>
                  <td className="p-2 text-right">{variant.sends}</td>
                  <td className="p-2 text-right">
                    {variant.open_rate.toFixed(1)}%
                  </td>
                  <td className="p-2 text-right">
                    {variant.click_rate.toFixed(1)}%
                  </td>
                  <td className="p-2 text-right">
                    {variant.reply_rate.toFixed(1)}%
                  </td>
                  <td className="p-2 text-right">
                    {variant.meeting_rate ? variant.meeting_rate.toFixed(1) + "%" : "—"}
                  </td>
                  <td className="p-2 text-center">
                    {variant.is_winner ? "⭐" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

