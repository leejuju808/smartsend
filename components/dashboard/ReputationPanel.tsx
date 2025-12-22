"use client";

// Block 56000 — SmartSend Roofing "Customer Review + Reputation Automation System" v1
// Reputation Panel Component for Owner Dashboard
// Displays KPIs, feedback list, testimonials library, and rating trend graph

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Star,
  TrendingUp,
  TrendingDown,
  MessageSquare,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Download,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { useCurrentWorkspace } from "@/hooks/useCurrentWorkspace";

interface ReputationMetrics {
  total_reviews: number;
  total_requests_sent: number;
  total_responses: number;
  avg_rating: number;
  google_reviews_sent: number;
  google_reviews_submitted: number;
  internal_feedback_count: number;
  testimonials_collected: number;
  testimonials_approved: number;
  satisfaction_rate: number;
  response_rate: number;
}

interface ReviewRequest {
  id: string;
  job_id: string;
  response_rating: number | null;
  feedback: string | null;
  review_stage: string;
  sent_at: string;
  created_at: string;
  job: {
    title: string | null;
  } | null;
  homeowner: {
    name: string | null;
    email: string | null;
  } | null;
}

interface Testimonial {
  id: string;
  content: string;
  rating: number;
  homeowner_name: string | null;
  photo_url: string | null;
  approved: boolean;
  created_at: string;
  job: {
    title: string | null;
  } | null;
}

interface TrendData {
  date: string;
  avg_rating: number;
  total_reviews: number;
  satisfaction_rate: number;
}

export function ReputationPanel() {
  const { workspace } = useCurrentWorkspace();
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<ReputationMetrics | null>(null);
  const [recentFeedback, setRecentFeedback] = useState<ReviewRequest[]>([]);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [trendData, setTrendData] = useState<TrendData[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspace?.id) return;

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        // Fetch metrics
        const metricsRes = await fetch(
          `/api/reviews/dashboard?workspace_id=${workspace.id}`
        );
        if (!metricsRes.ok) throw new Error("Failed to fetch metrics");
        const metricsData = await metricsRes.json();
        setMetrics(metricsData.metrics);
        setRecentFeedback(metricsData.recent_feedback || []);
        setTestimonials(metricsData.testimonials || []);
        setTrendData(metricsData.trend || []);
      } catch (err: any) {
        setError(err.message || "Failed to load reputation data");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [workspace?.id]);

  const handleApproveTestimonial = async (testimonialId: string) => {
    try {
      const res = await fetch(`/api/reviews/testimonials/${testimonialId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved: true }),
      });

      if (res.ok) {
        setTestimonials((prev) =>
          prev.map((t) =>
            t.id === testimonialId ? { ...t, approved: true } : t
          )
        );
      }
    } catch (err) {
      console.error("Error approving testimonial:", err);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-red-600">
            <AlertCircle className="h-5 w-5" />
            <span>{error}</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Star className="h-5 w-5 text-yellow-500" />
          Reputation Dashboard
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="feedback">Feedback</TabsTrigger>
            <TabsTrigger value="testimonials">Testimonials</TabsTrigger>
            <TabsTrigger value="trends">Trends</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <KpiCard
                label="Avg Rating"
                value={metrics?.avg_rating?.toFixed(1) || "0.0"}
                icon={<Star className="h-4 w-4 text-yellow-500" />}
              />
              <KpiCard
                label="Total Reviews"
                value={metrics?.total_reviews || 0}
                icon={<MessageSquare className="h-4 w-4 text-blue-500" />}
              />
              <KpiCard
                label="Google Reviews Sent"
                value={metrics?.google_reviews_sent || 0}
                icon={<ExternalLink className="h-4 w-4 text-green-500" />}
              />
              <KpiCard
                label="Satisfaction Rate"
                value={`${metrics?.satisfaction_rate?.toFixed(1) || 0}%`}
                icon={<TrendingUp className="h-4 w-4 text-green-500" />}
              />
            </div>

            {/* Secondary Metrics */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="text-sm text-gray-600">Response Rate</div>
                <div className="text-2xl font-semibold">
                  {metrics?.response_rate?.toFixed(1) || 0}%
                </div>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="text-sm text-gray-600">Internal Feedback</div>
                <div className="text-2xl font-semibold">
                  {metrics?.internal_feedback_count || 0}
                </div>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="text-sm text-gray-600">Testimonials</div>
                <div className="text-2xl font-semibold">
                  {metrics?.testimonials_collected || 0}
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="feedback" className="space-y-4">
            <div className="space-y-3">
              {recentFeedback.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No feedback yet. Reviews will appear here once homeowners respond.
                </div>
              ) : (
                recentFeedback.map((feedback) => (
                  <div
                    key={feedback.id}
                    className="p-4 border rounded-lg space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {feedback.response_rating && (
                          <div className="flex items-center gap-1">
                            {"★".repeat(feedback.response_rating)}
                            <span className="text-sm text-gray-500 ml-1">
                              ({feedback.response_rating}/5)
                            </span>
                          </div>
                        )}
                        <Badge
                          variant={
                            feedback.review_stage === "internal_feedback"
                              ? "destructive"
                              : feedback.review_stage === "google_push"
                              ? "default"
                              : "secondary"
                          }
                        >
                          {feedback.review_stage.replace("_", " ")}
                        </Badge>
                      </div>
                      <span className="text-xs text-gray-500">
                        {new Date(feedback.sent_at).toLocaleDateString()}
                      </span>
                    </div>
                    {feedback.feedback && (
                      <p className="text-sm text-gray-700">{feedback.feedback}</p>
                    )}
                    <div className="text-xs text-gray-500">
                      Job: {feedback.job?.title || "N/A"} •{" "}
                      {feedback.homeowner?.name || feedback.homeowner?.email || "Anonymous"}
                    </div>
                  </div>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="testimonials" className="space-y-4">
            <div className="space-y-3">
              {testimonials.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No testimonials yet. Approved testimonials will appear here.
                </div>
              ) : (
                testimonials.map((testimonial) => (
                  <div
                    key={testimonial.id}
                    className="p-4 border rounded-lg space-y-3"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          {"★".repeat(testimonial.rating)}
                          <span className="text-sm font-medium">
                            {testimonial.homeowner_name || "Anonymous"}
                          </span>
                          {testimonial.approved ? (
                            <Badge variant="default" className="ml-2">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Approved
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="ml-2">
                              Pending
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-gray-700">{testimonial.content}</p>
                        {testimonial.job?.title && (
                          <div className="text-xs text-gray-500 mt-2">
                            Job: {testimonial.job.title}
                          </div>
                        )}
                      </div>
                      {!testimonial.approved && (
                        <Button
                          size="sm"
                          onClick={() => handleApproveTestimonial(testimonial.id)}
                        >
                          Approve
                        </Button>
                      )}
                    </div>
                    {testimonial.photo_url && (
                      <img
                        src={testimonial.photo_url}
                        alt="Testimonial"
                        className="w-full max-w-xs rounded-lg"
                      />
                    )}
                  </div>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="trends" className="space-y-4">
            <div className="h-64 flex items-center justify-center border rounded-lg">
              {trendData.length === 0 ? (
                <div className="text-center text-gray-500">
                  No trend data yet. Metrics will appear here over time.
                </div>
              ) : (
                <div className="w-full p-4">
                  <div className="text-sm font-medium mb-4">Rating Trend (Last 30 Days)</div>
                  <div className="space-y-2">
                    {trendData.slice(-7).map((point, idx) => (
                      <div key={idx} className="flex items-center gap-4">
                        <div className="w-20 text-xs text-gray-500">
                          {new Date(point.date).toLocaleDateString()}
                        </div>
                        <div className="flex-1 bg-gray-100 rounded-full h-6 relative">
                          <div
                            className="bg-yellow-400 h-6 rounded-full flex items-center justify-end pr-2"
                            style={{
                              width: `${(point.avg_rating / 5) * 100}%`,
                            }}
                          >
                            <span className="text-xs font-medium text-gray-900">
                              {point.avg_rating.toFixed(1)}
                            </span>
                          </div>
                        </div>
                        <div className="w-16 text-xs text-gray-500 text-right">
                          {point.total_reviews} reviews
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function KpiCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
}) {
  return (
    <div className="p-4 bg-gray-50 rounded-lg">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm text-gray-600">{label}</div>
        {icon}
      </div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}
































