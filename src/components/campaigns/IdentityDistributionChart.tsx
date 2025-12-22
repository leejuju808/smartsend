/**
 * Block 12100 — Identity Distribution Chart Component
 * Shows distribution of sends across identities for a campaign
 */

"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

interface IdentityDistribution {
  identity_id: string;
  identity_name: string | null;
  email_address: string;
  send_count: number;
  percentage: number;
}

interface IdentityDistributionChartProps {
  campaignId: string;
}

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

export function IdentityDistributionChart({ campaignId }: IdentityDistributionChartProps) {
  const [distribution, setDistribution] = useState<IdentityDistribution[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDistribution();
  }, [campaignId]);

  async function loadDistribution() {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/identity-distribution`);
      if (!res.ok) throw new Error("Failed to load distribution");
      const data = await res.json();
      setDistribution(data.distribution || []);
    } catch (error) {
      console.error("Error loading identity distribution:", error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-sm text-muted-foreground">Loading distribution...</p>
        </CardContent>
      </Card>
    );
  }

  if (distribution.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-sm text-muted-foreground">No identity distribution data available</p>
        </CardContent>
      </Card>
    );
  }

  const chartData = distribution.map((item, index) => ({
    name: item.identity_name || item.email_address.split("@")[0],
    email: item.email_address,
    sends: item.send_count,
    percentage: item.percentage,
    color: COLORS[index % COLORS.length],
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Identity Distribution</CardTitle>
        <CardDescription>
          Distribution of sends across sending identities for this campaign
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Chart */}
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="name" 
                angle={-45}
                textAnchor="end"
                height={100}
              />
              <YAxis />
              <Tooltip 
                formatter={(value: number, name: string, props: any) => {
                  if (name === "sends") {
                    return [`${value} sends (${props.payload.percentage}%)`, "Sends"];
                  }
                  return value;
                }}
              />
              <Bar dataKey="sends" fill="#3b82f6">
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* Legend */}
          <div className="space-y-2">
            {chartData.map((item, index) => (
              <div key={item.email} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div
                    className="w-4 h-4 rounded"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="font-medium">{item.name}</span>
                  <span className="text-muted-foreground">({item.email})</span>
                </div>
                <div className="text-right">
                  <span className="font-semibold">{item.sends.toLocaleString()}</span>
                  <span className="text-muted-foreground ml-2">
                    ({item.percentage.toFixed(1)}%)
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}




























































