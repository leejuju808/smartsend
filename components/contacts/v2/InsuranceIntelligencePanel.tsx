// Block 19000 — SmartSend AI Insurance Brain v1
// Insurance Intelligence Dashboard Panel
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/Button";
import { Progress } from "@/components/ui/progress";
import {
  Shield,
  TrendingUp,
  DollarSign,
  AlertCircle,
  CheckCircle2,
  Clock,
  FileText,
  Zap,
  Building2,
  MapPin,
  Target,
  Lightbulb,
} from "lucide-react";
import { useState, useEffect } from "react";

interface InsuranceIntelligencePanelProps {
  contactId: string;
}

interface InsuranceIntelligence {
  is_insurance_candidate: boolean;
  insurance_probability_score: number;
  claim_type: string;
  claim_type_confidence: number;
  coverage_type: string;
  coverage_type_detected: boolean;
  deductible_amount: number | null;
  deductible_affordability: string;
  adjuster_status: string;
  approval_likelihood: string;
  approval_likelihood_score: number;
  supplement_potential: string;
  supplement_opportunities: Array<{
    type: string;
    item: string;
    reason: string;
  }>;
  estimated_payout: number | null;
  estimated_payout_min: number | null;
  estimated_payout_max: number | null;
  next_best_action: string | null;
  detected_keywords: string[];
  detection_confidence: number;
}

const CLAIM_TYPE_LABELS: Record<string, string> = {
  wind: "Wind Claim",
  hail: "Hail Claim",
  leak_water_damage: "Leak / Water Damage",
  tree_impact: "Tree Impact",
  ice_dam: "Ice Dam",
  general_storm: "General Storm",
  unknown: "Unknown",
};

const COVERAGE_TYPE_LABELS: Record<string, string> = {
  rcv: "RCV (Replacement Cost Value)",
  acv: "ACV (Actual Cash Value)",
  depreciation: "Depreciation",
  deductible_policy: "Deductible Policy",
  cosmetic_exclusion: "Cosmetic Exclusion",
  matching_law: "Matching Law",
  manufacturer_defect: "Manufacturer Defect",
  unknown: "Unknown",
};

const APPROVAL_LIKELIHOOD_COLORS: Record<string, string> = {
  high: "text-green-600 bg-green-100",
  moderate: "text-yellow-600 bg-yellow-100",
  low: "text-orange-600 bg-orange-100",
  likely_denial: "text-red-600 bg-red-100",
  supplement_required: "text-purple-600 bg-purple-100",
};

const SUPPLEMENT_POTENTIAL_COLORS: Record<string, string> = {
  high: "text-green-600 bg-green-100",
  medium: "text-yellow-600 bg-yellow-100",
  low: "text-orange-600 bg-orange-100",
  none: "text-gray-600 bg-gray-100",
};

export function InsuranceIntelligencePanel({
  contactId,
}: InsuranceIntelligencePanelProps) {
  const [intelligence, setIntelligence] =
    useState<InsuranceIntelligence | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadIntelligence() {
      try {
        const res = await fetch(`/api/insurance/contact/${contactId}`);
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Failed to load insurance intelligence");
        }

        setIntelligence(data.intelligence);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    }

    void loadIntelligence();
  }, [contactId]);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Insurance Intelligence
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">Loading...</div>
        </CardContent>
      </Card>
    );
  }

  if (error || !intelligence) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Insurance Intelligence
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-red-600">
            {error || "No insurance intelligence available"}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!intelligence.is_insurance_candidate) {
    return null; // Don't show panel if not an insurance candidate
  }

  return (
    <Card className="border-2 border-purple-300 bg-gradient-to-br from-purple-50 to-white">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Shield className="h-5 w-5 text-purple-600" />
          <span>Insurance Intelligence</span>
          <Badge
            variant="outline"
            className="ml-auto bg-purple-100 text-purple-700"
          >
            INSURANCE CANDIDATE
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Probability Score */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold">Insurance Probability</span>
            <span className="text-sm font-bold text-purple-600">
              {intelligence.insurance_probability_score}/100
            </span>
          </div>
          <Progress
            value={intelligence.insurance_probability_score}
            className="h-2"
          />
          <div className="text-xs text-muted-foreground mt-1">
            {intelligence.insurance_probability_score >= 80
              ? "Very High"
              : intelligence.insurance_probability_score >= 60
              ? "High"
              : intelligence.insurance_probability_score >= 40
              ? "Moderate"
              : "Low"}
          </div>
        </div>

        {/* Claim Type */}
        <div className="p-3 bg-white rounded-lg border">
          <div className="flex items-center gap-2 mb-1">
            <Target className="h-4 w-4 text-purple-600" />
            <span className="text-xs font-semibold text-muted-foreground">
              Claim Type
            </span>
          </div>
          <div className="font-semibold">
            {CLAIM_TYPE_LABELS[intelligence.claim_type] || "Unknown"}
          </div>
          {intelligence.claim_type_confidence > 0 && (
            <div className="text-xs text-muted-foreground mt-1">
              Confidence: {Math.round(intelligence.claim_type_confidence * 100)}%
            </div>
          )}
        </div>

        {/* Coverage Type */}
        {intelligence.coverage_type_detected && (
          <div className="p-3 bg-white rounded-lg border">
            <div className="flex items-center gap-2 mb-1">
              <FileText className="h-4 w-4 text-blue-600" />
              <span className="text-xs font-semibold text-muted-foreground">
                Coverage Type
              </span>
            </div>
            <div className="font-semibold">
              {COVERAGE_TYPE_LABELS[intelligence.coverage_type] || "Unknown"}
            </div>
          </div>
        )}

        {/* Deductible */}
        {intelligence.deductible_amount && (
          <div className="p-3 bg-white rounded-lg border">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-4 w-4 text-green-600" />
              <span className="text-xs font-semibold text-muted-foreground">
                Deductible
              </span>
            </div>
            <div className="font-semibold">
              ${intelligence.deductible_amount.toLocaleString()}
            </div>
            {intelligence.deductible_affordability !== "unknown" && (
              <Badge
                variant="outline"
                className={`mt-2 ${
                  intelligence.deductible_affordability === "high"
                    ? "bg-green-100 text-green-700"
                    : intelligence.deductible_affordability === "medium"
                    ? "bg-yellow-100 text-yellow-700"
                    : "bg-red-100 text-red-700"
                }`}
              >
                Affordability: {intelligence.deductible_affordability}
              </Badge>
            )}
          </div>
        )}

        {/* Adjuster Status */}
        {intelligence.adjuster_status !== "not_scheduled" && (
          <div className="p-3 bg-white rounded-lg border">
            <div className="flex items-center gap-2 mb-1">
              <Building2 className="h-4 w-4 text-blue-600" />
              <span className="text-xs font-semibold text-muted-foreground">
                Adjuster Status
              </span>
            </div>
            <div className="font-semibold capitalize">
              {intelligence.adjuster_status.replace(/_/g, " ")}
            </div>
          </div>
        )}

        {/* Approval Likelihood */}
        <div className="p-3 bg-white rounded-lg border">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="h-4 w-4 text-green-600" />
            <span className="text-xs font-semibold text-muted-foreground">
              Approval Likelihood
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              className={
                APPROVAL_LIKELIHOOD_COLORS[intelligence.approval_likelihood] ||
                "bg-gray-100 text-gray-700"
              }
            >
              {intelligence.approval_likelihood.replace(/_/g, " ")}
            </Badge>
            <span className="text-sm font-semibold">
              {intelligence.approval_likelihood_score}%
            </span>
          </div>
        </div>

        {/* Storm Severity */}
        <div className="p-3 bg-white rounded-lg border">
          <div className="flex items-center gap-2 mb-1">
            <Zap className="h-4 w-4 text-yellow-600" />
            <span className="text-xs font-semibold text-muted-foreground">
              Storm Severity
            </span>
          </div>
          <div className="font-semibold capitalize">
            {/* Would come from intelligence metadata */}
            Moderate
          </div>
        </div>

        {/* Estimated Payout */}
        {(intelligence.estimated_payout ||
          intelligence.estimated_payout_min ||
          intelligence.estimated_payout_max) && (
          <div className="p-3 bg-gradient-to-r from-green-50 to-blue-50 rounded-lg border border-green-200">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-4 w-4 text-green-600" />
              <span className="text-xs font-semibold text-muted-foreground">
                Estimated Payout
              </span>
            </div>
            {intelligence.estimated_payout ? (
              <div className="font-bold text-lg text-green-700">
                ${intelligence.estimated_payout.toLocaleString()}
              </div>
            ) : (
              <div className="font-bold text-lg text-green-700">
                $
                {intelligence.estimated_payout_min?.toLocaleString() || "0"} - $
                {intelligence.estimated_payout_max?.toLocaleString() || "0"}
              </div>
            )}
          </div>
        )}

        {/* Supplement Opportunities */}
        {intelligence.supplement_potential !== "none" &&
          intelligence.supplement_opportunities.length > 0 && (
            <div className="p-3 bg-white rounded-lg border">
              <div className="flex items-center gap-2 mb-2">
                <Lightbulb className="h-4 w-4 text-purple-600" />
                <span className="text-xs font-semibold text-muted-foreground">
                  Supplement Potential
                </span>
                <Badge
                  className={
                    SUPPLEMENT_POTENTIAL_COLORS[
                      intelligence.supplement_potential
                    ] || "bg-gray-100 text-gray-700"
                  }
                >
                  {intelligence.supplement_potential.toUpperCase()}
                </Badge>
              </div>
              <div className="space-y-1">
                {intelligence.supplement_opportunities.map((opp, idx) => (
                  <div key={idx} className="text-xs">
                    <span className="font-semibold">{opp.item}:</span>{" "}
                    {opp.reason}
                  </div>
                ))}
              </div>
            </div>
          )}

        {/* Next Best Action */}
        {intelligence.next_best_action && (
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-center gap-2 mb-1">
              <Target className="h-4 w-4 text-blue-600" />
              <span className="text-xs font-semibold text-muted-foreground">
                Next Best Action
              </span>
            </div>
            <div className="text-sm font-semibold">
              {intelligence.next_best_action}
            </div>
          </div>
        )}

        {/* Detected Keywords */}
        {intelligence.detected_keywords.length > 0 && (
          <div className="p-3 bg-gray-50 rounded-lg border">
            <div className="text-xs font-semibold text-muted-foreground mb-2">
              Detected Keywords ({intelligence.detected_keywords.length})
            </div>
            <div className="flex flex-wrap gap-1">
              {intelligence.detected_keywords.slice(0, 10).map((keyword, idx) => (
                <Badge
                  key={idx}
                  variant="outline"
                  className="text-xs bg-white"
                >
                  {keyword}
                </Badge>
              ))}
              {intelligence.detected_keywords.length > 10 && (
                <Badge variant="outline" className="text-xs bg-white">
                  +{intelligence.detected_keywords.length - 10} more
                </Badge>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}





















































