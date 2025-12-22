"use client";

// Block 84000 — Reviews + Referral Dashboard
// Dashboard for roofers to manage reviews and referrals

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ReviewRequestsTable } from "./components/ReviewRequestsTable";
import { ReferralDashboard } from "./components/ReferralDashboard";
import { RewardsSection } from "./components/RewardsSection";
import { useCurrentWorkspace } from "@/hooks/useCurrentWorkspace";

export default function ReviewsReferralsPage() {
  const { workspace } = useCurrentWorkspace();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalReviewRequests: 0,
    completedReviews: 0,
    totalReferrals: 0,
    leadsGenerated: 0,
    jobsClosed: 0,
    revenueFromReferrals: 0,
  });

  useEffect(() => {
    const fetchStats = async () => {
      if (!workspace?.id) return;

      try {
        const response = await fetch(
          `/api/reviews-referrals/stats?workspaceId=${workspace.id}`
        );
        if (response.ok) {
          const data = await response.json();
          setStats(data.stats);
        }
      } catch (error) {
        console.error("Error fetching stats:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [workspace?.id]);

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Reviews + Referrals</h1>
        <p className="text-gray-600 mt-2">
          Turn every completed job into more reviews, referrals, and revenue
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Review Requests
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalReviewRequests}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Reviews Completed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {stats.completedReviews}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Total Referrals
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalReferrals}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Leads Generated
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {stats.leadsGenerated}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Jobs Closed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              {stats.jobsClosed}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">
              Revenue from Referrals
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              ${stats.revenueFromReferrals.toLocaleString()}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="reviews" className="space-y-4">
        <TabsList>
          <TabsTrigger value="reviews">Review Requests</TabsTrigger>
          <TabsTrigger value="referrals">Referral Performance</TabsTrigger>
          <TabsTrigger value="rewards">Rewards</TabsTrigger>
        </TabsList>

        <TabsContent value="reviews">
          <ReviewRequestsTable workspaceId={workspace?.id} />
        </TabsContent>

        <TabsContent value="referrals">
          <ReferralDashboard workspaceId={workspace?.id} />
        </TabsContent>

        <TabsContent value="rewards">
          <RewardsSection workspaceId={workspace?.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}



























