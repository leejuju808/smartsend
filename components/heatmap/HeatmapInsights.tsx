"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Lightbulb, AlertCircle, TrendingUp, Zap } from "lucide-react";

interface HeatmapInsight {
  id: string;
  zip?: string;
  neighborhood_name?: string;
  insight_type: string;
  insight_text: string;
  insight_color: "green" | "yellow" | "blue" | "red";
  priority: number;
  suggested_action?: string;
  action_type?: string;
}

interface HeatmapInsightsProps {
  workspaceId: string;
}

export function HeatmapInsights({ workspaceId }: HeatmapInsightsProps) {
  const [insights, setInsights] = useState<HeatmapInsight[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadInsights();
  }, [workspaceId]);

  const loadInsights = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/heatmap/insights?workspace_id=${workspaceId}`
      );
      
      if (!response.ok) {
        throw new Error("Failed to load insights");
      }

      const result = await response.json();
      setInsights(result.insights || []);
    } catch (error) {
      console.error("Error loading insights:", error);
    } finally {
      setLoading(false);
    }
  };

  const getInsightIcon = (type: string) => {
    switch (type) {
      case "engagement":
        return <TrendingUp className="w-5 h-5" />;
      case "storm":
        return <Zap className="w-5 h-5" />;
      case "opportunity":
        return <Lightbulb className="w-5 h-5" />;
      default:
        return <AlertCircle className="w-5 h-5" />;
    }
  };

  const getInsightColorClasses = (color: string) => {
    switch (color) {
      case "green":
        return "bg-green-50 border-green-200 text-green-900";
      case "yellow":
        return "bg-yellow-50 border-yellow-200 text-yellow-900";
      case "blue":
        return "bg-blue-50 border-blue-200 text-blue-900";
      case "red":
        return "bg-red-50 border-red-200 text-red-900";
      default:
        return "bg-gray-50 border-gray-200 text-gray-900";
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          Loading insights...
        </CardContent>
      </Card>
    );
  }

  if (insights.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Heatmap Insights</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            No insights available yet. Start sending campaigns to generate insights.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <Lightbulb className="w-5 h-5 mr-2" />
          Heatmap Insights
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {insights.map((insight) => (
            <div
              key={insight.id}
              className={`p-4 rounded-lg border ${getInsightColorClasses(insight.insight_color)}`}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5">{getInsightIcon(insight.insight_type)}</div>
                <div className="flex-1">
                  <p className="font-medium">{insight.insight_text}</p>
                  {insight.suggested_action && (
                    <p className="text-sm mt-1 opacity-80">
                      💡 {insight.suggested_action}
                    </p>
                  )}
                  {insight.neighborhood_name && (
                    <p className="text-xs mt-2 opacity-60">
                      {insight.neighborhood_name} ({insight.zip})
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}






































