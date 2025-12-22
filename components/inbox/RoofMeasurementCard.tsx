"use client";

import useSWR from "swr";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Ruler, TrendingUp, DollarSign, Wrench, Home, Calendar, AlertCircle } from "lucide-react";

interface RoofMeasurement {
  id: string;
  estimated_squares_min: number | null;
  estimated_squares_max: number | null;
  estimated_squares_avg: number | null;
  pitch_estimate: string | null;
  pitch_category: string | null;
  complexity_rating: string | null;
  replacement_cost_min: number | null;
  replacement_cost_max: number | null;
  replacement_cost_avg: number | null;
  confidence_score: number;
  likely_job_type: string | null;
  roof_age_min: number | null;
  roof_age_max: number | null;
  roof_age_median: number | null;
  condition_assessment: string | null;
  quality_feedback: string | null;
  replacement_reasons: string[] | null;
  repair_reasons: string[] | null;
}

export function RoofMeasurementCard({ threadId }: { threadId: string }) {
  const { data, mutate, isLoading } = useSWR<{ measurement: RoofMeasurement | null }>(
    `/api/roof-measurements/${threadId}`,
    (u) => fetch(u).then((r) => r.json()),
    { refreshInterval: 10000 }
  );

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="text-sm text-muted-foreground">Loading roof measurements...</div>
        </CardContent>
      </Card>
    );
  }

  const measurement = data?.measurement;

  if (!measurement) {
    return null;
  }

  const formatCurrency = (value: number | null) => {
    if (!value) return "—";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatSquares = () => {
    if (!measurement.estimated_squares_min || !measurement.estimated_squares_max) {
      return "—";
    }
    return `${measurement.estimated_squares_min}–${measurement.estimated_squares_max} squares`;
  };

  const formatAge = () => {
    if (!measurement.roof_age_min || !measurement.roof_age_max) {
      return "—";
    }
    if (measurement.roof_age_min === measurement.roof_age_max) {
      return `${measurement.roof_age_min} years`;
    }
    return `${measurement.roof_age_min}–${measurement.roof_age_max} years`;
  };

  const getConfidenceColor = (score: number) => {
    if (score >= 75) return "text-green-600";
    if (score >= 50) return "text-yellow-600";
    return "text-red-600";
  };

  const getJobTypeVariant = (jobType: string | null) => {
    if (jobType === "replacement") return "default";
    if (jobType === "repair_only") return "secondary";
    return "outline";
  };

  const getComplexityColor = (rating: string | null) => {
    switch (rating) {
      case "low":
        return "text-green-600";
      case "medium":
        return "text-yellow-600";
      case "high":
        return "text-orange-600";
      case "very_high":
        return "text-red-600";
      default:
        return "text-muted-foreground";
    }
  };

  return (
    <Card className="border-2 border-primary/20 bg-gradient-to-br from-background to-muted/20">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-lg">
          <div className="flex items-center gap-2">
            <Ruler className="h-5 w-5 text-primary" />
            <span>Roof Measurement AI</span>
          </div>
          <Badge
            variant="outline"
            className={`text-xs font-semibold ${getConfidenceColor(measurement.confidence_score)}`}
          >
            {measurement.confidence_score}% confidence
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Size Estimation */}
        <div className="flex items-start gap-3">
          <Home className="h-4 w-4 mt-0.5 text-muted-foreground" />
          <div className="flex-1">
            <div className="text-xs text-muted-foreground mb-1">Estimated Size</div>
            <div className="text-base font-semibold">{formatSquares()}</div>
            {measurement.estimated_squares_avg && (
              <div className="text-xs text-muted-foreground mt-0.5">
                Avg: {measurement.estimated_squares_avg.toFixed(1)} squares
              </div>
            )}
          </div>
        </div>

        {/* Pitch */}
        {measurement.pitch_estimate && (
          <div className="flex items-start gap-3">
            <TrendingUp className="h-4 w-4 mt-0.5 text-muted-foreground" />
            <div className="flex-1">
              <div className="text-xs text-muted-foreground mb-1">Pitch</div>
              <div className="text-base font-semibold">
                {measurement.pitch_estimate}
                {measurement.pitch_category && (
                  <span className="text-xs text-muted-foreground ml-2">
                    ({measurement.pitch_category})
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Complexity */}
        {measurement.complexity_rating && (
          <div className="flex items-start gap-3">
            <AlertCircle className="h-4 w-4 mt-0.5 text-muted-foreground" />
            <div className="flex-1">
              <div className="text-xs text-muted-foreground mb-1">Complexity</div>
              <div className={`text-base font-semibold capitalize ${getComplexityColor(measurement.complexity_rating)}`}>
                {measurement.complexity_rating.replace("_", " ")}
              </div>
            </div>
          </div>
        )}

        {/* Age */}
        {(measurement.roof_age_min || measurement.roof_age_max) && (
          <div className="flex items-start gap-3">
            <Calendar className="h-4 w-4 mt-0.5 text-muted-foreground" />
            <div className="flex-1">
              <div className="text-xs text-muted-foreground mb-1">Roof Age</div>
              <div className="text-base font-semibold">{formatAge()}</div>
              {measurement.condition_assessment && (
                <div className="text-xs text-muted-foreground mt-0.5 capitalize">
                  Condition: {measurement.condition_assessment.replace("_", " ")}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Job Type */}
        {measurement.likely_job_type && measurement.likely_job_type !== "unknown" && (
          <div className="flex items-start gap-3">
            <Wrench className="h-4 w-4 mt-0.5 text-muted-foreground" />
            <div className="flex-1">
              <div className="text-xs text-muted-foreground mb-1">Likely Job</div>
              <Badge variant={getJobTypeVariant(measurement.likely_job_type)} className="text-sm font-semibold">
                {measurement.likely_job_type === "replacement" ? "Replacement Likely" : "Repair Only"}
              </Badge>
              {measurement.replacement_reasons && measurement.replacement_reasons.length > 0 && (
                <div className="text-xs text-muted-foreground mt-2">
                  Reasons: {measurement.replacement_reasons.join(", ")}
                </div>
              )}
              {measurement.repair_reasons && measurement.repair_reasons.length > 0 && (
                <div className="text-xs text-muted-foreground mt-2">
                  Reasons: {measurement.repair_reasons.join(", ")}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Replacement Cost */}
        {measurement.replacement_cost_min && measurement.replacement_cost_max && (
          <div className="flex items-start gap-3">
            <DollarSign className="h-4 w-4 mt-0.5 text-muted-foreground" />
            <div className="flex-1">
              <div className="text-xs text-muted-foreground mb-1">Replacement Estimate</div>
              <div className="text-base font-semibold">
                {formatCurrency(measurement.replacement_cost_min)} – {formatCurrency(measurement.replacement_cost_max)}
              </div>
              {measurement.replacement_cost_avg && (
                <div className="text-xs text-muted-foreground mt-0.5">
                  Avg: {formatCurrency(measurement.replacement_cost_avg)}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Quality Feedback */}
        {measurement.quality_feedback && measurement.confidence_score < 60 && (
          <div className="mt-3 p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded text-xs text-yellow-800 dark:text-yellow-200">
            <div className="font-semibold mb-1">💡 Suggestion:</div>
            {measurement.quality_feedback}
          </div>
        )}

        {/* Refresh Button */}
        <div className="pt-2 border-t">
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={() => mutate()}
          >
            Refresh Measurement
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}



















































