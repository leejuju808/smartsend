"use client";

// Block 94000 — Customer Experience Dashboard
// Internal dashboard for owners/ops to see customer experience metrics and feedback

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  Star, 
  MessageSquare,
  Users,
  Calendar
} from "lucide-react";
import { Skeleton } from "@/src/components/ui/skeleton";

interface ExperienceMetrics {
  avg_rating: number;
  total_feedback: number;
  promoters_count: number;
  at_risk_count: number;
  trend: "up" | "down" | "stable";
  trend_percent: number;
}

interface FeedbackEvent {
  id: string;
  job_id: string;
  trigger_type: string;
  rating: number;
  comment: string | null;
  is_promoter: boolean;
  is_at_risk: boolean;
  created_at: string;
  job_title?: string;
  homeowner_name?: string;
}

interface HomeownerMessage {
  id: string;
  job_id: string;
  direction: string;
  body: string;
  is_read: boolean;
  created_at: string;
  job_title?: string;
}

interface AtRiskJob {
  job_id: string;
  job_title?: string;
  homeowner_name?: string;
  lowest_rating: number;
  feedback_count: number;
  latest_feedback: string;
}

export default function ExperienceDashboardPage() {
  const [metrics, setMetrics] = useState<ExperienceMetrics | null>(null);
  const [recentFeedback, setRecentFeedback] = useState<FeedbackEvent[]>([]);
  const [unreadMessages, setUnreadMessages] = useState<HomeownerMessage[]>([]);
  const [atRiskJobs, setAtRiskJobs] = useState<AtRiskJob[]>([]);
  const [promoters, setPromoters] = useState<FeedbackEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      setLoading(true);
      const response = await fetch("/api/experience/dashboard");
      if (!response.ok) throw new Error("Failed to load experience data");
      
      const data = await response.json();
      setMetrics(data.metrics || null);
      setRecentFeedback(data.recent_feedback || []);
      setUnreadMessages(data.unread_messages || []);
      setAtRiskJobs(data.at_risk_jobs || []);
      setPromoters(data.promoters || []);
    } catch (error: any) {
      console.error("Error loading experience data:", error);
    } finally {
      setLoading(false);
    }
  }

  const getTrendIcon = (trend: string) => {
    if (trend === "up") return <TrendingUp className="h-4 w-4 text-green-600" />;
    if (trend === "down") return <TrendingDown className="h-4 w-4 text-red-600" />;
    return null;
  };

  const getRatingColor = (rating: number) => {
    if (rating >= 9) return "bg-green-100 text-green-800";
    if (rating >= 7) return "bg-blue-100 text-blue-800";
    if (rating >= 5) return "bg-yellow-100 text-yellow-800";
    return "bg-red-100 text-red-800";
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Customer Experience</h1>
        <p className="text-gray-600 mt-1">
          Track homeowner satisfaction, feedback, and identify areas for improvement
        </p>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">
              Avg Experience Rating
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-3xl font-bold text-gray-900">
                  {metrics?.avg_rating?.toFixed(1) || "0.0"}
                </div>
                <div className="text-xs text-gray-500 mt-1">out of 10</div>
              </div>
              {metrics?.trend && (
                <div className="flex items-center gap-1">
                  {getTrendIcon(metrics.trend)}
                  <span className={`text-sm font-medium ${
                    metrics.trend === "up" ? "text-green-600" : 
                    metrics.trend === "down" ? "text-red-600" : 
                    "text-gray-600"
                  }`}>
                    {metrics.trend_percent > 0 ? "+" : ""}{metrics.trend_percent}%
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600">
              Total Feedback
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-gray-900">
              {metrics?.total_feedback || 0}
            </div>
            <div className="text-xs text-gray-500 mt-1">Last 30 days</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <Star className="h-4 w-4 text-green-600" />
              Promoters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">
              {metrics?.promoters_count || 0}
            </div>
            <div className="text-xs text-gray-500 mt-1">9-10 ratings</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              At-Risk Jobs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">
              {metrics?.at_risk_count || 0}
            </div>
            <div className="text-xs text-gray-500 mt-1">≤6 ratings</div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="feedback" className="space-y-4">
        <TabsList>
          <TabsTrigger value="feedback">Recent Feedback</TabsTrigger>
          <TabsTrigger value="at-risk">At-Risk Jobs</TabsTrigger>
          <TabsTrigger value="promoters">Promoters</TabsTrigger>
          <TabsTrigger value="messages">Open Questions</TabsTrigger>
        </TabsList>

        <TabsContent value="feedback" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Feedback Events</CardTitle>
            </CardHeader>
            <CardContent>
              {recentFeedback.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">
                  No feedback events yet
                </p>
              ) : (
                <div className="space-y-4">
                  {recentFeedback.map((feedback) => (
                    <div
                      key={feedback.id}
                      className="border border-gray-200 rounded-lg p-4 space-y-2"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <Badge className={getRatingColor(feedback.rating)}>
                              {feedback.rating}/10
                            </Badge>
                            <span className="text-sm font-medium text-gray-900">
                              {feedback.job_title || `Job #${feedback.job_id.substring(0, 8)}`}
                            </span>
                            {feedback.homeowner_name && (
                              <span className="text-sm text-gray-500">
                                • {feedback.homeowner_name}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 mb-2">
                            {feedback.trigger_type.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                            {" • "}
                            {new Date(feedback.created_at).toLocaleDateString()}
                          </div>
                          {feedback.comment && (
                            <p className="text-sm text-gray-700 mt-2">{feedback.comment}</p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          {feedback.is_promoter && (
                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                              Promoter
                            </Badge>
                          )}
                          {feedback.is_at_risk && (
                            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                              At-Risk
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="at-risk" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-600" />
                At-Risk Jobs (Rating ≤ 6)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {atRiskJobs.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">
                  No at-risk jobs. Great work!
                </p>
              ) : (
                <div className="space-y-4">
                  {atRiskJobs.map((job) => (
                    <div
                      key={job.job_id}
                      className="border border-red-200 rounded-lg p-4 bg-red-50"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <Badge className="bg-red-100 text-red-800">
                              {job.lowest_rating}/10
                            </Badge>
                            <span className="font-medium text-gray-900">
                              {job.job_title || `Job #${job.job_id.substring(0, 8)}`}
                            </span>
                            {job.homeowner_name && (
                              <span className="text-sm text-gray-600">
                                • {job.homeowner_name}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-700 mb-2">
                            {job.latest_feedback}
                          </p>
                          <div className="text-xs text-gray-500">
                            {job.feedback_count} feedback event{job.feedback_count !== 1 ? "s" : ""}
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(`/jobs/${job.job_id}`, "_blank")}
                        >
                          View Job
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="promoters" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Star className="h-5 w-5 text-green-600" />
                Promoters (9-10 Ratings)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {promoters.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">
                  No promoters yet
                </p>
              ) : (
                <div className="space-y-4">
                  {promoters.map((feedback) => (
                    <div
                      key={feedback.id}
                      className="border border-green-200 rounded-lg p-4 bg-green-50"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <Badge className="bg-green-100 text-green-800">
                              {feedback.rating}/10
                            </Badge>
                            <span className="font-medium text-gray-900">
                              {feedback.job_title || `Job #${feedback.job_id.substring(0, 8)}`}
                            </span>
                            {feedback.homeowner_name && (
                              <span className="text-sm text-gray-600">
                                • {feedback.homeowner_name}
                              </span>
                            )}
                          </div>
                          {feedback.comment && (
                            <p className="text-sm text-gray-700 mt-2">{feedback.comment}</p>
                          )}
                          <div className="text-xs text-gray-500 mt-2">
                            {new Date(feedback.created_at).toLocaleDateString()}
                          </div>
                        </div>
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                          Promoter
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="messages" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Unread Homeowner Questions
              </CardTitle>
            </CardHeader>
            <CardContent>
              {unreadMessages.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">
                  No unread messages
                </p>
              ) : (
                <div className="space-y-4">
                  {unreadMessages.map((message) => (
                    <div
                      key={message.id}
                      className="border border-gray-200 rounded-lg p-4"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <Badge variant="outline">Unread</Badge>
                            <span className="font-medium text-gray-900">
                              {message.job_title || `Job #${message.job_id.substring(0, 8)}`}
                            </span>
                          </div>
                          <p className="text-sm text-gray-700 mb-2">{message.body}</p>
                          <div className="text-xs text-gray-500">
                            {new Date(message.created_at).toLocaleDateString()}
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(`/jobs/${message.job_id}`, "_blank")}
                        >
                          View Job
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}



























