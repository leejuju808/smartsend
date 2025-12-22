"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";

type LeadScoreCardProps = {
  score: number | null | undefined;
  positive?: Record<string, number>;
  negative?: Record<string, number>;
  className?: string;
};

export function LeadScoreCard({
  score,
  positive,
  negative,
  className,
}: LeadScoreCardProps) {
  const scoreValue = score ?? 0;

  // Color coding based on score
  const getScoreColor = (s: number) => {
    if (s >= 80) return "text-green-600 bg-green-50 border-green-200";
    if (s >= 60) return "text-yellow-600 bg-yellow-50 border-yellow-200";
    if (s >= 40) return "text-orange-600 bg-orange-50 border-orange-200";
    return "text-red-600 bg-red-50 border-red-200";
  };

  const getScoreLabel = (s: number) => {
    if (s >= 80) return "High Quality";
    if (s >= 60) return "Good Quality";
    if (s >= 40) return "Fair Quality";
    return "Low Quality";
  };

  const getScoreBadgeVariant = (s: number): "default" | "secondary" | "destructive" | "outline" => {
    if (s >= 80) return "default";
    if (s >= 60) return "secondary";
    if (s >= 40) return "outline";
    return "destructive";
  };

  // Get positive factors summary
  const positiveFactors = positive
    ? Object.entries(positive)
        .filter(([_, value]) => value > 0)
        .map(([key, value]) => ({
          key,
          value,
          label: getFactorLabel(key),
        }))
        .slice(0, 3) // Show top 3
    : [];

  // Get negative factors summary
  const negativeFactors = negative
    ? Object.entries(negative)
        .filter(([_, value]) => value < 0)
        .map(([key, value]) => ({
          key,
          value,
          label: getFactorLabel(key),
        }))
        .slice(0, 2) // Show top 2
    : [];

  return (
    <Card className={cn("p-4 space-y-3", className)}>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold mb-1">Lead Quality Score</h3>
          <div className="flex items-baseline gap-2">
            <span className={cn("text-3xl font-bold", getScoreColor(scoreValue).split(" ")[0])}>
              {scoreValue}
            </span>
            <span className="text-sm text-muted-foreground">/100</span>
          </div>
        </div>
        <Badge variant={getScoreBadgeVariant(scoreValue)} className="text-xs">
          {getScoreLabel(scoreValue)}
        </Badge>
      </div>

      {/* Positive Factors */}
      {positiveFactors.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <TrendingUp className="h-3 w-3 text-green-600" />
            <span className="font-medium">Strengths</span>
          </div>
          <div className="space-y-0.5">
            {positiveFactors.map((factor) => (
              <div key={factor.key} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{factor.label}</span>
                <span className="text-green-600 font-medium">+{factor.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Negative Factors */}
      {negativeFactors.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <TrendingDown className="h-3 w-3 text-red-600" />
            <span className="font-medium">Concerns</span>
          </div>
          <div className="space-y-0.5">
            {negativeFactors.map((factor) => (
              <div key={factor.key} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{factor.label}</span>
                <span className="text-red-600 font-medium">{factor.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function getFactorLabel(key: string): string {
  const labels: Record<string, string> = {
    title: "Title exists",
    seniority: "Seniority known",
    linkedin: "LinkedIn profile",
    size: "Ideal company size",
    industry: "Industry match",
    tech: "Tech stack known",
    location: "Location data",
    enriched: "Enriched successfully",
    open: "Email opened",
    click: "Email clicked",
    reply: "Replied",
    interested: "Interested reply",
    free_email: "Free email domain",
    no_enrichment: "No enrichment",
    no_title: "Missing title",
    no_company: "Missing company",
    large_enterprise: "Large enterprise",
    very_small: "Very small company",
    bounce: "Email bounced",
    spam: "Spam complaint",
  };
  return labels[key] || key;
}



