"use client";

import { useEffect, useState } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AiInsights {
  id?: string;
  summary: string;
  buying_intent: string;
  intent_score: number;
  objections: string;
  recommended_angle: string;
  next_action: string;
}

interface AiInsightsCardProps {
  leadId: string;
}

/**
 * Block 26590 — SmartSend Roofing Lead Timeline AI Insights v1
 * AI-powered sales intelligence card for roofing leads
 */
export function AiInsightsCard({ leadId }: AiInsightsCardProps) {
  const [insights, setInsights] = useState<AiInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    loadInsights();
  }, [leadId]);

  const loadInsights = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/leads/${leadId}/ai-insights`);
      if (response.ok) {
        const data = await response.json();
        setInsights(data);
      } else if (response.status === 404) {
        // No insights yet, that's okay
        setInsights(null);
      }
    } catch (error) {
      console.error("Error loading insights:", error);
    } finally {
      setLoading(false);
    }
  };

  const generateInsights = async () => {
    try {
      setGenerating(true);
      const response = await fetch(`/api/leads/${leadId}/ai-insights/generate`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to generate insights");
      }

      const data = await response.json();
      setInsights(data);
    } catch (error) {
      console.error("Error generating insights:", error);
      alert("Failed to generate insights. Please try again.");
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border bg-white shadow-sm p-4">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Sparkles className="h-4 w-4 animate-pulse" />
          Loading AI insights...
        </div>
      </div>
    );
  }

  if (!insights) {
    return (
      <div className="rounded-xl border bg-white shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-blue-600" />
            AI Lead Insights
          </h2>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          Generate AI-powered sales intelligence for this lead.
        </p>
        <Button
          onClick={generateInsights}
          disabled={generating}
          className="w-full"
          size="sm"
        >
          {generating ? (
            <>
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Generate Insights
            </>
          )}
        </Button>
      </div>
    );
  }

  const getIntentColor = (intent: string) => {
    const normalized = intent.toLowerCase();
    if (normalized.includes("high")) return "text-green-600 font-bold";
    if (normalized.includes("medium")) return "text-yellow-600 font-bold";
    if (normalized.includes("low")) return "text-red-600 font-bold";
    return "text-gray-600";
  };

  const getIntentBgColor = (intent: string) => {
    const normalized = intent.toLowerCase();
    if (normalized.includes("high")) return "bg-green-50 border-green-200";
    if (normalized.includes("medium")) return "bg-yellow-50 border-yellow-200";
    if (normalized.includes("low")) return "bg-red-50 border-red-200";
    return "bg-gray-50 border-gray-200";
  };

  return (
    <div className="rounded-xl border bg-white shadow-sm p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-blue-600" />
          AI Lead Insights
        </h2>
        <Button
          onClick={generateInsights}
          disabled={generating}
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0"
        >
          <RefreshCw
            className={`h-4 w-4 ${generating ? "animate-spin" : ""}`}
          />
        </Button>
      </div>

      {/* Summary */}
      <div>
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
          Summary
        </div>
        <div className="text-sm text-gray-900 leading-relaxed">
          {insights.summary}
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-3 gap-4">
        <div className={`rounded-lg border p-3 ${getIntentBgColor(insights.buying_intent)}`}>
          <div className="text-xs text-gray-500 mb-1">Buying Intent</div>
          <div className={`text-lg font-semibold ${getIntentColor(insights.buying_intent)}`}>
            {insights.buying_intent}
          </div>
        </div>

        <div className="rounded-lg border bg-gray-50 border-gray-200 p-3">
          <div className="text-xs text-gray-500 mb-1">Intent Score</div>
          <div className="text-lg font-semibold text-gray-900">
            {insights.intent_score}/100
          </div>
        </div>

        <div className="rounded-lg border bg-blue-50 border-blue-200 p-3">
          <div className="text-xs text-gray-500 mb-1">Next Action</div>
          <div className="text-sm font-semibold text-blue-900">
            {insights.next_action}
          </div>
        </div>
      </div>

      {/* Objections */}
      {insights.objections && insights.objections.toLowerCase() !== "none detected." && (
        <div>
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
            Objections Detected
          </div>
          <div className="text-sm text-gray-900 bg-red-50 border border-red-200 rounded-lg p-3">
            {insights.objections}
          </div>
        </div>
      )}

      {/* Recommended Sales Angle */}
      <div>
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
          Best Sales Angle
        </div>
        <div className="text-sm font-semibold text-gray-900 bg-blue-50 border border-blue-200 rounded-lg p-3">
          {insights.recommended_angle}
        </div>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string | number;
  highlight?: "green" | "yellow" | "red";
}) {
  const color =
    highlight === "green"
      ? "text-green-600 font-bold"
      : highlight === "yellow"
      ? "text-yellow-600 font-bold"
      : highlight === "red"
      ? "text-red-600 font-bold"
      : "text-gray-900";

  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-lg ${color}`}>{value}</div>
    </div>
  );
}
