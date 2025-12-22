// Block 57000 — Proposal Analytics Component
// Shows view rate, signature rate, upsell acceptance rate, revenue closed

"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type Analytics = {
  total_proposals: number;
  sent_count: number;
  viewed_count: number;
  signed_count: number;
  view_rate: number;
  signature_rate: number;
  upsell_acceptance_rate: number;
  revenue_closed_this_month: number;
  average_proposal_value: number;
};

export function ProposalAnalytics() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    try {
      const response = await fetch("/api/proposals/analytics");
      if (response.ok) {
        const data = await response.json();
        setAnalytics(data.analytics);
      }
    } catch (error) {
      console.error("Error loading analytics:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardContent className="pt-6">
              <Skeleton className="h-20 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!analytics) {
    return <Card><CardContent className="pt-6">No analytics data available</CardContent></Card>;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-gray-600">View Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{analytics.view_rate.toFixed(1)}%</p>
            <p className="text-sm text-gray-500 mt-1">
              {analytics.viewed_count} of {analytics.sent_count} viewed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-gray-600">Signature Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{analytics.signature_rate.toFixed(1)}%</p>
            <p className="text-sm text-gray-500 mt-1">
              {analytics.signed_count} of {analytics.viewed_count} signed
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-gray-600">Upsell Acceptance</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{analytics.upsell_acceptance_rate.toFixed(1)}%</p>
            <p className="text-sm text-gray-500 mt-1">Average upsell rate</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-gray-600">Revenue This Month</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">${analytics.revenue_closed_this_month.toLocaleString()}</p>
            <p className="text-sm text-gray-500 mt-1">From signed proposals</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Total Proposals</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{analytics.total_proposals}</p>
            <p className="text-sm text-gray-500 mt-1">All time</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Average Proposal Value</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">${analytics.average_proposal_value.toLocaleString()}</p>
            <p className="text-sm text-gray-500 mt-1">Per signed proposal</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
































