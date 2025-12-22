"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MessageSquare, TrendingUp, Calendar, Send, ArrowRight, Sparkles } from "lucide-react";

interface InsightsData {
  replies_today: number;
  high_intent_replies: number;
  meetings_detected: number;
  send_volume_today: number;
  send_plan_capacity: number;
  ai_insights?: string[];
}

export function TodaysInsightsWidget() {
  const [insights, setInsights] = useState<InsightsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/insights")
      .then((res) => res.json())
      .then((data) => {
        setInsights(data);
      })
      .catch(() => {
        // Silently fail - widget will show placeholder
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading || !insights) {
    return (
      <section className="border rounded-xl p-4 bg-card space-y-2">
        <h2 className="text-sm font-medium">Today's Insights</h2>
        <p className="text-xs text-muted-foreground">
          Loading insights...
        </p>
      </section>
    );
  }

  const sendProgress = insights.send_plan_capacity > 0
    ? Math.round((insights.send_volume_today / insights.send_plan_capacity) * 100)
    : 0;

  return (
    <section className="border rounded-xl p-4 bg-card space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Today's Insights</h2>
        <Link
          href="/insights"
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          View Full <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <div>
            <div className="text-lg font-bold">{insights.replies_today}</div>
            <div className="text-xs text-muted-foreground">Replies</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          <div>
            <div className="text-lg font-bold">{insights.high_intent_replies}</div>
            <div className="text-xs text-muted-foreground">High Intent</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <div>
            <div className="text-lg font-bold">{insights.meetings_detected}</div>
            <div className="text-xs text-muted-foreground">Meetings</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Send className="h-4 w-4 text-muted-foreground" />
          <div>
            <div className="text-lg font-bold">{sendProgress}%</div>
            <div className="text-xs text-muted-foreground">Send Progress</div>
          </div>
        </div>
      </div>

      {insights.ai_insights && insights.ai_insights.length > 0 && (
        <div className="pt-2 border-t">
          <div className="flex items-start gap-2">
            <Sparkles className="h-3 w-3 text-purple-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-muted-foreground line-clamp-2">
              {insights.ai_insights[0]}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}









