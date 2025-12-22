"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Star } from "lucide-react";

interface VariantStat {
  variant_id: string;
  campaign_id: string;
  name: string;
  weight: number;
  sends: number;
  opens: number;
  clicks: number;
  replies: number;
  open_rate: number;
  click_rate: number;
  reply_rate: number;
  is_winner: boolean;
}

interface ABStatsProps {
  campaignId: string;
}

export function ABStats({ campaignId }: ABStatsProps) {
  const [stats, setStats] = useState<VariantStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
    // Refresh every 30 seconds
    const interval = setInterval(loadStats, 30000);
    return () => clearInterval(interval);
  }, [campaignId]);

  async function loadStats() {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/variants/summary`);
      const data = await res.json();
      if (data.variants) {
        setStats(data.variants);
      }
    } catch (error) {
      console.error("Failed to load A/B stats:", error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>A/B Test Stats</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  if (stats.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>A/B Test Stats</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">
            No variants found. Create variants to see A/B test results.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>A/B Test Stats</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left p-2">Variant</th>
                <th className="text-right p-2">Sends</th>
                <th className="text-right p-2">Open %</th>
                <th className="text-right p-2">Click %</th>
                <th className="text-right p-2">Reply %</th>
                <th className="text-center p-2">Winner?</th>
              </tr>
            </thead>
            <tbody>
              {stats.map((stat) => (
                <tr key={stat.variant_id} className="border-b hover:bg-gray-50">
                  <td className="p-2 font-medium">{stat.name}</td>
                  <td className="p-2 text-right">{stat.sends || 0}</td>
                  <td className="p-2 text-right">
                    {stat.open_rate !== null
                      ? `${stat.open_rate.toFixed(1)}%`
                      : "0%"}
                  </td>
                  <td className="p-2 text-right">
                    {stat.click_rate !== null
                      ? `${stat.click_rate.toFixed(1)}%`
                      : "0%"}
                  </td>
                  <td className="p-2 text-right">
                    {stat.reply_rate !== null
                      ? `${stat.reply_rate.toFixed(1)}%`
                      : "0%"}
                  </td>
                  <td className="p-2 text-center">
                    {stat.is_winner && (
                      <Star className="h-4 w-4 text-yellow-500 fill-yellow-500 inline" />
                    )}
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










