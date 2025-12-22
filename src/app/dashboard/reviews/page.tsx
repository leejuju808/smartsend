"use client";

// Block 35801 — SmartSend Roofing "Smart Reputation Engine + Review Booster v1"
// Review Dashboard Page

import { useEffect, useState } from "react";
import { Star, TrendingUp, AlertCircle, Users, DollarSign, ExternalLink } from "lucide-react";

interface DashboardMetrics {
  reviews_collected_this_week?: number;
  avg_rating?: number;
  review_conversion_rate?: number;
  negative_feedback_percentage?: number;
  jobs_without_review_prompt?: number;
  referral_leads_generated?: number;
  referral_revenue?: number;
  platform_distribution?: Record<string, number>;
}

interface Review {
  id: string;
  rating: number;
  status: string;
  review_platform?: string;
  completed_at?: string;
  sent_at?: string;
  leads?: {
    id: string;
    name?: string;
    email?: string;
    first_name?: string;
    last_name?: string;
  };
  roofing_jobs?: {
    id: string;
    title?: string;
    job_value?: number;
  };
}

interface ReferralLead {
  id: string;
  referred_name: string;
  referred_phone?: string;
  referred_email?: string;
  status: string;
  job_value?: number;
  created_at: string;
}

export default function ReviewsDashboardPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics>({});
  const [recentReviews, setRecentReviews] = useState<Review[]>([]);
  const [referralLeads, setReferralLeads] = useState<ReferralLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<"week" | "month" | "quarter">("month");

  useEffect(() => {
    fetchDashboardData();
  }, [dateRange]);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const startDate = getStartDate(dateRange);
      const endDate = new Date().toISOString();

      const response = await fetch(
        `/api/reviews/dashboard?start_date=${startDate}&end_date=${endDate}`
      );

      if (!response.ok) {
        throw new Error("Failed to fetch dashboard data");
      }

      const data = await response.json();
      setMetrics(data.metrics || {});
      setRecentReviews(data.recent_reviews || []);
      setReferralLeads(data.referral_leads || []);
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  const getStartDate = (range: "week" | "month" | "quarter"): string => {
    const now = new Date();
    switch (range) {
      case "week":
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      case "month":
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      case "quarter":
        return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
      default:
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    }
  };

  const renderStars = (rating: number) => {
    return (
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`h-4 w-4 ${
              star <= rating ? "fill-yellow-400 text-yellow-400" : "text-gray-300"
            }`}
          />
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Review & Reputation Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track reviews, satisfaction scores, and referral leads from completed jobs
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setDateRange("week")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              dateRange === "week"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Week
          </button>
          <button
            onClick={() => setDateRange("month")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              dateRange === "month"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Month
          </button>
          <button
            onClick={() => setDateRange("quarter")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              dateRange === "quarter"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Quarter
          </button>
        </div>
      </div>

      {/* Key Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Reviews Collected This Week */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-600">Reviews This Week</h3>
            <Star className="h-5 w-5 text-yellow-400" />
          </div>
          <div className="text-3xl font-bold text-gray-900">
            {metrics.reviews_collected_this_week || 0}
          </div>
          <p className="text-xs text-gray-500 mt-1">5-star reviews collected</p>
        </div>

        {/* Average Rating */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-600">Average Rating</h3>
            <TrendingUp className="h-5 w-5 text-green-500" />
          </div>
          <div className="flex items-center gap-2">
            <div className="text-3xl font-bold text-gray-900">
              {metrics.avg_rating?.toFixed(1) || "0.0"}
            </div>
            {metrics.avg_rating && renderStars(Math.round(metrics.avg_rating))}
          </div>
          <p className="text-xs text-gray-500 mt-1">Based on all ratings</p>
        </div>

        {/* Conversion Rate */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-600">Conversion Rate</h3>
            <TrendingUp className="h-5 w-5 text-blue-500" />
          </div>
          <div className="text-3xl font-bold text-gray-900">
            {metrics.review_conversion_rate?.toFixed(1) || "0.0"}%
          </div>
          <p className="text-xs text-gray-500 mt-1">Requests → Completed reviews</p>
        </div>

        {/* Negative Feedback */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-600">Negative Feedback</h3>
            <AlertCircle className="h-5 w-5 text-red-500" />
          </div>
          <div className="text-3xl font-bold text-gray-900">
            {metrics.negative_feedback_percentage?.toFixed(1) || "0.0"}%
          </div>
          <p className="text-xs text-gray-500 mt-1">1-3 star ratings</p>
        </div>
      </div>

      {/* Referral Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Referral Leads</h3>
            <Users className="h-5 w-5 text-blue-500" />
          </div>
          <div className="text-4xl font-bold text-gray-900 mb-2">
            {metrics.referral_leads_generated || 0}
          </div>
          <p className="text-sm text-gray-600">Generated from 5-star reviews</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Referral Revenue</h3>
            <DollarSign className="h-5 w-5 text-green-500" />
          </div>
          <div className="text-4xl font-bold text-gray-900 mb-2">
            ${(metrics.referral_revenue || 0).toLocaleString()}
          </div>
          <p className="text-sm text-gray-600">Revenue from referral jobs</p>
        </div>
      </div>

      {/* Platform Distribution */}
      {metrics.platform_distribution && Object.keys(metrics.platform_distribution).length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Review Platform Distribution</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(metrics.platform_distribution).map(([platform, count]) => (
              <div key={platform} className="text-center">
                <div className="text-2xl font-bold text-gray-900">{count as number}</div>
                <div className="text-sm text-gray-600 capitalize">{platform}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Reviews */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Reviews</h3>
        <div className="space-y-4">
          {recentReviews.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No reviews yet</p>
          ) : (
            recentReviews.map((review) => (
              <div
                key={review.id}
                className="flex items-center justify-between p-4 border border-gray-100 rounded-lg hover:bg-gray-50"
              >
                <div className="flex items-center gap-4">
                  <div>{renderStars(review.rating)}</div>
                  <div>
                    <div className="font-medium text-gray-900">
                      {review.leads?.first_name ||
                        review.leads?.name ||
                        "Anonymous"}
                    </div>
                    <div className="text-sm text-gray-500">
                      {review.roofing_jobs?.title || "Job"}
                      {review.review_platform && (
                        <span className="ml-2 capitalize">• {review.review_platform}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-sm text-gray-500">
                  {review.completed_at
                    ? new Date(review.completed_at).toLocaleDateString()
                    : review.sent_at
                    ? new Date(review.sent_at).toLocaleDateString()
                    : ""}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Referral Leads */}
      {referralLeads.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Referral Leads</h3>
          <div className="space-y-4">
            {referralLeads.map((lead) => (
              <div
                key={lead.id}
                className="flex items-center justify-between p-4 border border-gray-100 rounded-lg hover:bg-gray-50"
              >
                <div>
                  <div className="font-medium text-gray-900">{lead.referred_name}</div>
                  <div className="text-sm text-gray-500">
                    {lead.referred_phone && `Phone: ${lead.referred_phone}`}
                    {lead.referred_email && ` • Email: ${lead.referred_email}`}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-medium ${
                      lead.status === "won"
                        ? "bg-green-100 text-green-700"
                        : lead.status === "qualified"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-gray-100 text-gray-700"
                    }`}
                  >
                    {lead.status}
                  </span>
                  {lead.job_value && (
                    <span className="text-sm font-semibold text-gray-900">
                      ${lead.job_value.toLocaleString()}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Jobs Without Review Prompt */}
      {metrics.jobs_without_review_prompt && metrics.jobs_without_review_prompt > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="h-5 w-5 text-yellow-600" />
            <h3 className="text-lg font-semibold text-yellow-900">
              {metrics.jobs_without_review_prompt} Jobs Without Review Request
            </h3>
          </div>
          <p className="text-sm text-yellow-700">
            Some completed jobs haven't received a review request yet. Consider sending them
            manually.
          </p>
        </div>
      )}
    </div>
  );
}
































