// Block 22210 — SmartSend Roofing Loss Reason Detector v1
// Loss Reason Panel: Displays AI-detected loss reason with detailed analysis

"use client";

import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, TrendingDown, User, Wrench, Building2, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";

interface LossAnalysis {
  estimator_factors?: string[];
  homeowner_factors?: string[];
  process_factors?: string[];
  recommendations?: string[];
}

interface LossReasonPanelProps {
  lossReason: string | null;
  lossReasonDetails: string | null;
  lossAnalysis: LossAnalysis | null;
  confidence?: number | null;
  className?: string;
}

export function LossReasonPanel({
  lossReason,
  lossReasonDetails,
  lossAnalysis,
  confidence,
  className,
}: LossReasonPanelProps) {
  if (!lossReason) {
    return null;
  }

  const hasAnalysis = lossAnalysis && (
    (lossAnalysis.estimator_factors && lossAnalysis.estimator_factors.length > 0) ||
    (lossAnalysis.homeowner_factors && lossAnalysis.homeowner_factors.length > 0) ||
    (lossAnalysis.process_factors && lossAnalysis.process_factors.length > 0) ||
    (lossAnalysis.recommendations && lossAnalysis.recommendations.length > 0)
  );

  return (
    <Card className={cn("border-red-400/50 bg-red-600/10", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-5 w-5 text-red-400" />
          <CardTitle className="text-lg font-bold text-red-300">
            Loss Reason
          </CardTitle>
          {confidence !== null && confidence !== undefined && (
            <span className="ml-auto text-xs text-red-400/70">
              {confidence}% confidence
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Main Loss Reason */}
        <div>
          <p className="text-md font-semibold text-red-200 mb-1">
            {lossReason}
          </p>
          {lossReasonDetails && (
            <p className="text-sm text-red-300/90 mt-2">
              {lossReasonDetails}
            </p>
          )}
        </div>

        {/* Detailed Analysis */}
        {hasAnalysis && (
          <div className="space-y-4 pt-2 border-t border-red-400/30">
            <h4 className="font-semibold text-sm text-red-300 mb-3">
              AI Analysis:
            </h4>

            {/* Estimator Factors */}
            {lossAnalysis.estimator_factors && lossAnalysis.estimator_factors.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center gap-2 mb-1">
                  <User className="h-4 w-4 text-red-400" />
                  <span className="text-xs font-semibold text-red-300 uppercase tracking-wide">
                    Estimator Factors
                  </span>
                </div>
                <ul className="text-xs text-red-200/90 space-y-1 ml-6">
                  {lossAnalysis.estimator_factors.map((factor, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-red-400 mt-0.5">•</span>
                      <span>{factor}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Homeowner Factors */}
            {lossAnalysis.homeowner_factors && lossAnalysis.homeowner_factors.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center gap-2 mb-1">
                  <Building2 className="h-4 w-4 text-red-400" />
                  <span className="text-xs font-semibold text-red-300 uppercase tracking-wide">
                    Homeowner Factors
                  </span>
                </div>
                <ul className="text-xs text-red-200/90 space-y-1 ml-6">
                  {lossAnalysis.homeowner_factors.map((factor, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-red-400 mt-0.5">•</span>
                      <span>{factor}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Process Factors */}
            {lossAnalysis.process_factors && lossAnalysis.process_factors.length > 0 && (
              <div className="space-y-1">
                <div className="flex items-center gap-2 mb-1">
                  <Wrench className="h-4 w-4 text-red-400" />
                  <span className="text-xs font-semibold text-red-300 uppercase tracking-wide">
                    Process Factors
                  </span>
                </div>
                <ul className="text-xs text-red-200/90 space-y-1 ml-6">
                  {lossAnalysis.process_factors.map((factor, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-red-400 mt-0.5">•</span>
                      <span>{factor}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Recommendations */}
            {lossAnalysis.recommendations && lossAnalysis.recommendations.length > 0 && (
              <div className="space-y-1 pt-2 border-t border-red-400/20">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingDown className="h-4 w-4 text-yellow-400" />
                  <span className="text-xs font-semibold text-yellow-300 uppercase tracking-wide">
                    Recommendations
                  </span>
                </div>
                <ul className="text-xs text-yellow-200/90 space-y-1 ml-6">
                  {lossAnalysis.recommendations.map((rec, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <span className="text-yellow-400 mt-0.5">→</span>
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}









































