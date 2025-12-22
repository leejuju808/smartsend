"use client";

import { Card } from "@/components/ui/card";
import { Lightbulb } from "lucide-react";

interface AIRecommendationsProps {
  campaignId: string;
  performanceBadge: "strong" | "good" | "weak";
  replyRate: number;
  hotLeads: number;
  totalEstimatedValue: number;
}

export function AIRecommendations({
  campaignId,
  performanceBadge,
  replyRate,
  hotLeads,
  totalEstimatedValue,
}: AIRecommendationsProps) {
  const recommendations: string[] = [];

  // Generate recommendations based on performance
  if (performanceBadge === "strong") {
    recommendations.push("Schedule a call with HOT leads ASAP");
    recommendations.push("Run this campaign again in 7 days");
    if (hotLeads > 0) {
      recommendations.push("Follow up with warm leads this week");
    }
  } else if (performanceBadge === "good") {
    recommendations.push("Follow up with warm leads");
    recommendations.push("Add 30 new homeowners to list");
    if (replyRate < 8) {
      recommendations.push("Consider refining your subject line");
    }
  } else {
    recommendations.push("Review and improve your email content");
    recommendations.push("Add more homeowners to your list");
    if (replyRate < 3) {
      recommendations.push("Test different subject lines");
    }
  }

  // Always add these recommendations
  if (hotLeads > 0) {
    recommendations.push("Prioritize HOT leads - they're ready to book");
  }
  
  if (totalEstimatedValue > 10000) {
    recommendations.push("This campaign is generating significant value - consider scaling");
  }

  // Ensure we have at least 3 recommendations
  if (recommendations.length < 3) {
    recommendations.push("Run again in 7 days");
    recommendations.push("Add 30 new homeowners to list");
  }

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">SmartSend Recommendations</h2>
      <Card className="p-6 bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
        <div className="flex items-start gap-3 mb-4">
          <Lightbulb className="h-5 w-5 text-blue-600 mt-0.5" />
          <div>
            <h3 className="font-semibold text-blue-900">
              Here's what to do next:
            </h3>
            <p className="text-sm text-blue-700 mt-1">
              Based on your campaign performance, here are our recommendations:
            </p>
          </div>
        </div>
        <ul className="space-y-2">
          {recommendations.slice(0, 4).map((rec, index) => (
            <li key={index} className="flex items-start gap-2">
              <span className="text-blue-600 font-semibold mt-0.5">•</span>
              <span className="text-sm text-blue-900">{rec}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}





















































