"use client";

// Block 28060 — SmartSend Roofing Review & Referral Engine v1
// Review & Referral Dashboard Component

import { useEffect, useState } from "react";
import { StatCard } from "../../components/StatCard";
import { HomeownersList } from "./HomeownersList";
import { ReviewStats } from "./ReviewStats";
import { ReferralStats } from "./ReferralStats";

interface DashboardStats {
  reviews: {
    requested: number;
    clicked: number;
    completed: number;
    clickRate: number;
    completionRate: number;
  };
  referrals: {
    total: number;
    booked: number;
    closed: number;
    conversionRate: number;
  };
  homeowners: {
    total: number;
    totalReferrals: number;
    totalReviewsRequested: number;
    totalReviewsCompleted: number;
  };
}

export function ReviewReferralDashboard({ workspaceId }: { workspaceId: string }) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, [workspaceId]);

  const fetchStats = async () => {
    try {
      const response = await fetch("/api/review-referral/stats");
      const data = await response.json();
      if (data.ok) {
        setStats(data.stats);
      }
    } catch (error) {
      console.error("Error fetching stats:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  if (!stats) {
    return <div className="text-center py-8">Failed to load stats</div>;
  }

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Reviews Requested"
          value={stats.reviews.requested}
          subtitle={`${stats.reviews.completed} completed`}
        />
        <StatCard
          title="Review Completion Rate"
          value={`${stats.reviews.completionRate}%`}
          subtitle={`${stats.reviews.completed} of ${stats.reviews.requested}`}
        />
        <StatCard
          title="Referral Leads"
          value={stats.referrals.total}
          subtitle={`${stats.referrals.booked + stats.referrals.closed} converted`}
        />
        <StatCard
          title="Referral Conversion"
          value={`${stats.referrals.conversionRate}%`}
          subtitle={`${stats.referrals.booked + stats.referrals.closed} of ${stats.referrals.total}`}
        />
      </div>

      {/* Detailed Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ReviewStats stats={stats.reviews} />
        <ReferralStats stats={stats.referrals} />
      </div>

      {/* Homeowners List */}
      <div className="mt-6">
        <HomeownersList workspaceId={workspaceId} />
      </div>
    </div>
  );
}


































