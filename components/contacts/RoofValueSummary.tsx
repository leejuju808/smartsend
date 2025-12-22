// Block 18600 — SmartSend Roof Value Estimator v1
// Roof Value Summary Panel Component

"use client";

import React, { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Home,
  Wrench,
  RefreshCw,
  Shield,
  CloudLightning,
  TrendingUp,
  DollarSign
} from "lucide-react";

interface RoofValueEstimates {
  roofSize: {
    estimated_squares_min?: number;
    estimated_squares_max?: number;
    estimated_squares_avg?: number;
  } | null;
  repairCost: {
    estimated_repair_cost_min?: number;
    estimated_repair_cost_max?: number;
    estimated_repair_cost_avg?: number;
  } | null;
  replacementCost: {
    estimated_replacement_cost_min?: number;
    estimated_replacement_cost_max?: number;
    estimated_replacement_cost_avg?: number;
  } | null;
  insuranceScore: {
    payout_category?: string;
    insurance_payout_probability_very_high?: number;
    insurance_payout_probability_high?: number;
  } | null;
  stormDamage: {
    storm_replacement_value_min?: number;
    storm_replacement_value_max?: number;
  } | null;
  leadValue: {
    lead_money_score?: number;
    score_category?: string;
  } | null;
}

interface RoofValueSummaryProps {
  contactId: string;
}

export function RoofValueSummary({ contactId }: RoofValueSummaryProps) {
  const [estimates, setEstimates] = useState<RoofValueEstimates | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadEstimates() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/value/contact/${contactId}`);
        if (!res.ok) {
          throw new Error("Failed to load roof value estimates");
        }
        const json = await res.json();
        setEstimates(json.estimates);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    loadEstimates();
  }, [contactId]);

  if (loading) {
    return (
      <Card className="p-4 space-y-3">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-20 w-full" />
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-4">
        <p className="text-sm text-red-600">Error: {error}</p>
      </Card>
    );
  }

  if (!estimates) {
    return null;
  }

  const formatCurrency = (value: number | undefined) => {
    if (!value) return "N/A";
    return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  };

  const formatRange = (min: number | undefined, max: number | undefined) => {
    if (!min || !max) return "N/A";
    return `${formatCurrency(min)} – ${formatCurrency(max)}`;
  };

  const getScoreBadgeColor = (score: number | undefined) => {
    if (!score) return "bg-gray-100";
    if (score >= 85) return "bg-green-100 text-green-800";
    if (score >= 50) return "bg-yellow-100 text-yellow-800";
    return "bg-red-100 text-red-800";
  };

  const getCategoryLabel = (category: string | undefined) => {
    switch (category) {
      case "very_high":
        return "Very High";
      case "high":
        return "High";
      case "possible":
        return "Possible";
      case "low":
        return "Low";
      case "unlikely":
        return "Unlikely";
      default:
        return category || "Unknown";
    }
  };

  return (
    <Card className="p-4 space-y-4 bg-slate-50">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <DollarSign className="h-4 w-4" />
          Roof Value Summary
        </h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Roof Size Estimate */}
        {estimates.roofSize && (
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <Home className="h-3 w-3" />
              <span>Roof Size Estimate</span>
            </div>
            <div className="text-lg font-semibold">
              {estimates.roofSize.estimated_squares_avg
                ? `${estimates.roofSize.estimated_squares_avg.toFixed(1)} squares`
                : estimates.roofSize.estimated_squares_min &&
                  estimates.roofSize.estimated_squares_max
                ? `${estimates.roofSize.estimated_squares_min}–${estimates.roofSize.estimated_squares_max} squares`
                : "N/A"}
            </div>
            {estimates.roofSize.estimated_squares_min &&
              estimates.roofSize.estimated_squares_max && (
                <div className="text-xs text-gray-500">
                  Range: {estimates.roofSize.estimated_squares_min}–{estimates.roofSize.estimated_squares_max} squares
                </div>
              )}
          </div>
        )}

        {/* Repair Cost Estimate */}
        {estimates.repairCost && (
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <Wrench className="h-3 w-3" />
              <span>Repair Cost Estimate</span>
            </div>
            <div className="text-lg font-semibold">
              {formatRange(
                estimates.repairCost.estimated_repair_cost_min,
                estimates.repairCost.estimated_repair_cost_max
              )}
            </div>
            {estimates.repairCost.estimated_repair_cost_avg && (
              <div className="text-xs text-gray-500">
                Avg: {formatCurrency(estimates.repairCost.estimated_repair_cost_avg)}
              </div>
            )}
          </div>
        )}

        {/* Replacement Cost Estimate */}
        {estimates.replacementCost && (
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <RefreshCw className="h-3 w-3" />
              <span>Replacement Cost Estimate</span>
            </div>
            <div className="text-lg font-semibold text-green-700">
              {formatRange(
                estimates.replacementCost.estimated_replacement_cost_min,
                estimates.replacementCost.estimated_replacement_cost_max
              )}
            </div>
            {estimates.replacementCost.estimated_replacement_cost_avg && (
              <div className="text-xs text-gray-500">
                Avg: {formatCurrency(estimates.replacementCost.estimated_replacement_cost_avg)}
              </div>
            )}
          </div>
        )}

        {/* Insurance Payout Potential */}
        {estimates.insuranceScore && (
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <Shield className="h-3 w-3" />
              <span>Insurance Payout Potential</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                className={getScoreBadgeColor(
                  estimates.insuranceScore.insurance_payout_probability_very_high ||
                    estimates.insuranceScore.insurance_payout_probability_high
                )}
              >
                {getCategoryLabel(estimates.insuranceScore.payout_category)}
              </Badge>
            </div>
            {(estimates.insuranceScore.insurance_payout_probability_very_high ||
              estimates.insuranceScore.insurance_payout_probability_high) && (
              <div className="text-xs text-gray-500">
                Probability:{" "}
                {estimates.insuranceScore.insurance_payout_probability_very_high ||
                  estimates.insuranceScore.insurance_payout_probability_high}
                %
              </div>
            )}
          </div>
        )}

        {/* Storm Damage Value */}
        {estimates.stormDamage && (
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <CloudLightning className="h-3 w-3" />
              <span>Storm Replacement Value</span>
            </div>
            <div className="text-lg font-semibold text-blue-700">
              {formatRange(
                estimates.stormDamage.storm_replacement_value_min,
                estimates.stormDamage.storm_replacement_value_max
              )}
            </div>
          </div>
        )}

        {/* Total Lead Value Score */}
        {estimates.leadValue && (
          <div className="space-y-1 md:col-span-2">
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <TrendingUp className="h-3 w-3" />
              <span>Total Lead Money Score</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-2xl font-bold">
                {estimates.leadValue.lead_money_score || "N/A"}
              </div>
              <Badge className={getScoreBadgeColor(estimates.leadValue.lead_money_score)}>
                {estimates.leadValue.score_category === "high_value"
                  ? "High Value"
                  : estimates.leadValue.score_category === "medium_value"
                  ? "Medium Value"
                  : estimates.leadValue.score_category === "low_value"
                  ? "Low Value"
                  : "Unknown"}
              </Badge>
            </div>
            <div className="text-xs text-gray-500">
              Based on repair value, replacement value, insurance potential, job probability, material type, roof age, storm impact, and neighborhood wealth
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}





















































