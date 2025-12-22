// Block 22237 — SmartSend Roofing "Homeowner Experience Score v2" Panel
// Experience Panel Component for Lead Detail View
// Shows comprehensive experience score breakdown with reasons and timeline

"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/Button";
import { HomeownerExperienceMeter } from "@/src/components/pipeline/HomeownerExperienceMeter";
import { RefreshCw, TrendingUp, TrendingDown, Minus, AlertCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

interface ExperiencePanelProps {
  leadId: string;
  experienceScore?: number | null;
  experienceTrend?: "improving" | "declining" | "stable" | null;
  experienceScoreTrend?: number | null;
  experienceLastUpdated?: string | null;
  reason?: string | null;
}

interface TimelineEvent {
  id: string;
  created_at: string;
  event_summary: string;
  event_data: {
    experience_score?: number;
    trend?: number;
    reason?: string;
    previous_score?: number;
  };
}

export function ExperiencePanel({
  leadId,
  experienceScore,
  experienceTrend,
  experienceScoreTrend,
  experienceLastUpdated,
  reason,
}: ExperiencePanelProps) {
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);
  const [isRecalculating, setIsRecalculating] = useState(false);

  // Fetch timeline events for experience score updates
  useEffect(() => {
    const fetchTimeline = async () => {
      try {
        // Use Supabase client directly
        const { createClient } = await import("@/lib/supabase/client");
        const supabase = createClient();
        
        const { data, error } = await supabase
          .from("job_timelines")
          .select("*")
          .eq("lead_id", leadId)
          .eq("event_type", "experience_score_updated")
          .order("created_at", { ascending: false })
          .limit(5);

        if (!error && data) {
          setTimelineEvents(data as TimelineEvent[]);
        }
      } catch (error) {
        console.error("Error fetching timeline:", error);
      }
    };

    fetchTimeline();
  }, [leadId]);

  const handleRecalculate = async () => {
    setIsRecalculating(true);
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      
      // Call the edge function via Supabase
      const { data, error } = await supabase.functions.invoke("calculate-experience-score-v2", {
        body: { lead_id: leadId },
      });

      if (error) {
        throw error;
      }

      // Refresh the page to show updated score
      window.location.reload();
    } catch (error) {
      console.error("Error recalculating:", error);
      alert("Error recalculating experience score. Please try again.");
    } finally {
      setIsRecalculating(false);
    }
  };

  const getScoreRange = (score: number | null | undefined) => {
    if (score === null || score === undefined) return "Unknown";
    if (score >= 85) return "Excellent Experience";
    if (score >= 60) return "Good Experience";
    if (score >= 40) return "Neutral / Slipping";
    if (score >= 20) return "Negative Experience";
    return "Critical Experience";
  };

  const getScoreColor = (score: number | null | undefined) => {
    if (score === null || score === undefined) return "text-gray-400";
    if (score >= 85) return "text-green-400";
    if (score >= 60) return "text-yellow-400";
    if (score >= 40) return "text-orange-400";
    if (score >= 20) return "text-red-400";
    return "text-red-600";
  };

  const getTrendIcon = () => {
    const trend = experienceScoreTrend ?? 0;
    if (trend > 0) return <TrendingUp className="h-4 w-4 text-green-400" />;
    if (trend < 0) return <TrendingDown className="h-4 w-4 text-red-400" />;
    return <Minus className="h-4 w-4 text-gray-400" />;
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return "Never";
    try {
      return new Date(dateString).toLocaleString();
    } catch {
      return "Invalid date";
    }
  };

  return (
    <Card className="bg-white/5 border border-white/10">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-white">
            Homeowner Experience Score
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRecalculate}
            disabled={isRecalculating}
            className="text-xs"
          >
            <RefreshCw className={cn("h-3 w-3 mr-1", isRecalculating && "animate-spin")} />
            Recalculate
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Main Score Display */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <HomeownerExperienceMeter
              score={experienceScore}
              trend={experienceTrend}
              trendNumeric={experienceScoreTrend}
              size="lg"
              variant="panel"
              showLabel={false}
            />
            <div className="flex flex-col">
              <span className={cn("text-sm font-semibold", getScoreColor(experienceScore))}>
                {getScoreRange(experienceScore)}
              </span>
              {experienceScoreTrend !== null && experienceScoreTrend !== undefined && (
                <div className="flex items-center gap-1 text-xs text-gray-400 mt-1">
                  {getTrendIcon()}
                  <span>
                    {experienceScoreTrend > 0 ? "+" : ""}
                    {experienceScoreTrend} since last update
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Score Breakdown */}
        <div className="grid grid-cols-5 gap-2 pt-4 border-t border-white/10">
          <div className="text-center">
            <div className="text-xs text-gray-400 mb-1">85-100</div>
            <div className="text-green-400 font-semibold">🟢 Excellent</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-400 mb-1">60-84</div>
            <div className="text-yellow-400 font-semibold">🟡 Good</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-400 mb-1">40-59</div>
            <div className="text-orange-400 font-semibold">🟠 Neutral</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-400 mb-1">20-39</div>
            <div className="text-red-400 font-semibold">🔴 Negative</div>
          </div>
          <div className="text-center">
            <div className="text-xs text-gray-400 mb-1">0-19</div>
            <div className="text-red-600 font-semibold">⚫ Critical</div>
          </div>
        </div>

        {/* Reason */}
        {reason && (
          <div className="pt-4 border-t border-white/10">
            <h4 className="text-sm font-semibold text-white mb-2">Top Factors</h4>
            <p className="text-sm text-gray-300 leading-relaxed">{reason}</p>
          </div>
        )}

        {/* Last Update */}
        {experienceLastUpdated && (
          <div className="flex items-center gap-2 text-xs text-gray-400 pt-2 border-t border-white/10">
            <Clock className="h-3 w-3" />
            <span>Last updated: {formatDate(experienceLastUpdated)}</span>
          </div>
        )}

        {/* Timeline Events */}
        {timelineEvents.length > 0 && (
          <div className="pt-4 border-t border-white/10">
            <h4 className="text-sm font-semibold text-white mb-3">Recent Updates</h4>
            <div className="space-y-2">
              {timelineEvents.slice(0, 5).map((event) => (
                <div
                  key={event.id}
                  className="flex items-start gap-3 p-2 rounded bg-white/5 border border-white/10"
                >
                  <div className="flex-1">
                    <div className="text-xs text-gray-300 mb-1">
                      {formatDate(event.created_at)}
                    </div>
                    <div className="text-xs text-gray-400">
                      {event.event_summary}
                    </div>
                    {event.event_data.reason && (
                      <div className="text-xs text-gray-500 mt-1 italic">
                        {event.event_data.reason}
                      </div>
                    )}
                  </div>
                  {event.event_data.experience_score !== undefined && (
                    <div className={cn("text-sm font-semibold", getScoreColor(event.event_data.experience_score))}>
                      {event.event_data.experience_score}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {timelineEvents.length === 0 && (
          <div className="text-center py-4 text-sm text-gray-400">
            No experience score updates yet
          </div>
        )}
      </CardContent>
    </Card>
  );
}

