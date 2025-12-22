// Block 16500 — AI Summary Box Component
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, TrendingUp, Calendar, DollarSign, Target, AlertCircle } from "lucide-react";

interface AISummaryBoxProps {
  aiSummary: {
    intent: string;
    tone: string;
    job_type: string;
    storm_impact: {
      last_storm_date: string;
      storm_type: string;
      severity: string;
      storm_risk_level: string | null;
      hail_size: number | null;
    } | null;
    insurance_likelihood: {
      claim_likelihood: string;
      adjuster_mentioned: boolean;
      deductible_noted: boolean;
      claim_filed: boolean;
      acv_rcv_hints: boolean;
    };
    next_recommended_action: string;
    heat_score: number;
    close_probability: number;
    appointment_status: string;
    revenue_estimate: number | null;
  };
}

export function AISummaryBox({ aiSummary }: AISummaryBoxProps) {
  const getIntentColor = (intent: string) => {
    const upper = intent.toUpperCase();
    if (upper.includes("HOT") || upper.includes("INTERESTED")) return "bg-red-500";
    if (upper.includes("WARM")) return "bg-yellow-500";
    if (upper.includes("FOLLOW")) return "bg-blue-500";
    return "bg-gray-500";
  };

  const getToneColor = (tone: string) => {
    if (tone === "Positive") return "text-green-600";
    if (tone === "Neutral") return "text-gray-600";
    return "text-red-600";
  };

  const getHeatScoreColor = (score: number) => {
    if (score >= 70) return "text-red-600 font-bold";
    if (score >= 40) return "text-yellow-600 font-semibold";
    return "text-gray-600";
  };

  const getCloseProbabilityColor = (prob: number) => {
    if (prob >= 70) return "text-green-600";
    if (prob >= 40) return "text-yellow-600";
    return "text-gray-600";
  };

  return (
    <Card className="border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-white">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Sparkles className="h-5 w-5 text-blue-600" />
          <span>Homeowner Summary (AI)</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Intent & Tone Row */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-muted-foreground mb-1">Intent</div>
            <Badge className={getIntentColor(aiSummary.intent)}>
              {aiSummary.intent}
            </Badge>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Tone</div>
            <div className={`text-sm font-medium ${getToneColor(aiSummary.tone)}`}>
              {aiSummary.tone}
            </div>
          </div>
        </div>

        {/* Job Type */}
        <div>
          <div className="text-xs text-muted-foreground mb-1">Job Type</div>
          <Badge variant="outline" className="capitalize">
            {aiSummary.job_type.replace(/_/g, " ")}
          </Badge>
        </div>

        {/* Storm Impact */}
        {aiSummary.storm_impact && (
          <div className="p-2 bg-slate-50 rounded-lg border border-slate-200">
            <div className="text-xs text-muted-foreground mb-1">Storm Impact</div>
            <div className="text-sm space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-medium">Last Storm:</span>
                <span>{new Date(aiSummary.storm_impact.last_storm_date).toLocaleDateString()}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium">Type:</span>
                <Badge variant="outline" className="capitalize text-xs">
                  {aiSummary.storm_impact.storm_type}
                </Badge>
                {aiSummary.storm_impact.hail_size && (
                  <span className="text-xs text-muted-foreground">
                    ({aiSummary.storm_impact.hail_size}" hail)
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Insurance Likelihood */}
        <div className="p-2 bg-purple-50 rounded-lg border border-purple-200">
          <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            Insurance Likelihood
          </div>
          <div className="text-sm space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-medium">Claim Likelihood:</span>
              <Badge 
                variant={aiSummary.insurance_likelihood.claim_likelihood === "High" ? "destructive" : "default"}
                className="text-xs"
              >
                {aiSummary.insurance_likelihood.claim_likelihood}
              </Badge>
            </div>
            {aiSummary.insurance_likelihood.adjuster_mentioned && (
              <div className="text-xs text-purple-700">✓ Adjuster mentioned</div>
            )}
            {aiSummary.insurance_likelihood.claim_filed && (
              <div className="text-xs text-green-700">✓ Claim filed</div>
            )}
          </div>
        </div>

        {/* Heat Score & Close Probability */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              Heat Score
            </div>
            <div className={`text-2xl font-bold ${getHeatScoreColor(aiSummary.heat_score)}`}>
              {aiSummary.heat_score}
              <span className="text-sm font-normal text-muted-foreground">/100</span>
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <Target className="h-3 w-3" />
              Close Probability
            </div>
            <div className={`text-2xl font-bold ${getCloseProbabilityColor(aiSummary.close_probability)}`}>
              {aiSummary.close_probability}%
            </div>
          </div>
        </div>

        {/* Appointment Status */}
        <div>
          <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            Appointment Status
          </div>
          <Badge 
            variant={aiSummary.appointment_status === "Scheduled" ? "default" : "outline"}
            className={aiSummary.appointment_status === "Scheduled" ? "bg-green-500" : ""}
          >
            {aiSummary.appointment_status}
          </Badge>
        </div>

        {/* Revenue Estimate */}
        {aiSummary.revenue_estimate && (
          <div>
            <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <DollarSign className="h-3 w-3" />
              Revenue Estimate
            </div>
            <div className="text-lg font-bold text-green-600">
              ${aiSummary.revenue_estimate.toLocaleString()}
            </div>
          </div>
        )}

        {/* Next Recommended Action */}
        <div className="pt-2 border-t">
          <div className="text-xs text-muted-foreground mb-1">Next Recommended Action</div>
          <div className="text-sm font-semibold text-blue-700 bg-blue-50 p-2 rounded">
            {aiSummary.next_recommended_action}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}





















































