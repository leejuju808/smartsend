"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type RoutingLogData = {
  id: string;
  lead_id: string;
  estimator_id: string;
  workspace_id: string;
  reasoning: {
    zipcode?: string | null;
    job_type?: string | null;
    weights: Array<{
      estimator_id: string;
      is_available: boolean;
      score: number;
      final_weight: number;
      zone_match?: boolean;
    }>;
    chosen: {
      estimator_id: string;
      final_weight: number;
    };
  };
  created_at: string;
};

type RoutingLogProps = {
  log: RoutingLogData;
  estimatorName?: string;
  className?: string;
};

export function RoutingLog({ log, estimatorName, className }: RoutingLogProps) {
  const { reasoning } = log;

  const formatWeight = (weight: number): string => {
    return weight.toFixed(3);
  };

  const getAvailabilityBadge = (isAvailable: boolean) => {
    return (
      <Badge
        variant={isAvailable ? "default" : "secondary"}
        className={cn(
          "text-xs",
          isAvailable
            ? "bg-green-100 text-green-800 border-green-200"
            : "bg-gray-100 text-gray-600 border-gray-200"
        )}
      >
        {isAvailable ? "Available" : "Offline"}
      </Badge>
    );
  };

  const getZoneMatchBadge = (hasMatch: boolean) => {
    if (!hasMatch) return null;
    return (
      <Badge
        variant="outline"
        className="text-xs bg-blue-50 text-blue-700 border-blue-200"
      >
        Zone Match
      </Badge>
    );
  };

  return (
    <Card className={cn("rounded-xl border bg-white/5 p-4", className)}>
      {/* Header */}
      <div className="mb-4">
        <h2 className="text-xl font-bold mb-2">Routing Decision</h2>
        <div className="text-sm text-gray-300">
          SmartSend assigned this lead based on availability and performance.
        </div>
      </div>

      {/* Key Info Grid */}
      <div className="grid grid-cols-2 gap-3 mb-4 text-sm">
        <div>
          <strong className="text-gray-400">Estimator:</strong>{" "}
          <span className="text-white">
            {estimatorName || log.estimator_id.substring(0, 8)}
          </span>
        </div>
        {reasoning.zipcode && (
          <div>
            <strong className="text-gray-400">Zipcode:</strong>{" "}
            <span className="text-white">{reasoning.zipcode}</span>
          </div>
        )}
        {reasoning.job_type && (
          <div>
            <strong className="text-gray-400">Job Type:</strong>{" "}
            <span className="text-white capitalize">{reasoning.job_type}</span>
          </div>
        )}
        <div>
          <strong className="text-gray-400">Assigned At:</strong>{" "}
          <span className="text-white">
            {new Date(log.created_at).toLocaleString()}
          </span>
        </div>
      </div>

      {/* Weights Section */}
      <div className="mt-4">
        <h3 className="font-semibold mb-3 text-gray-200">Estimator Weights</h3>
        <div className="space-y-2">
          {reasoning.weights.map((weight, index) => {
            const isChosen = weight.estimator_id === reasoning.chosen.estimator_id;
            return (
              <div
                key={weight.estimator_id}
                className={cn(
                  "flex items-center justify-between p-2 rounded border",
                  isChosen
                    ? "bg-yellow-500/10 border-yellow-500/30"
                    : "bg-white/5 border-white/10"
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="text-gray-400 text-sm font-mono">
                    {weight.estimator_id.substring(0, 8)}
                  </span>
                  {getAvailabilityBadge(weight.is_available)}
                  {getZoneMatchBadge(weight.zone_match || false)}
                  {isChosen && (
                    <Badge className="bg-yellow-500 text-black text-xs">
                      Selected
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400">
                    Score: {(weight.score * 100).toFixed(0)}%
                  </span>
                  <span
                    className={cn(
                      "font-mono text-sm font-semibold",
                      isChosen ? "text-yellow-500" : "text-gray-300"
                    )}
                  >
                    {formatWeight(weight.final_weight)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Final Choice Highlight */}
      <div className="mt-4 p-3 rounded bg-black/20 border border-yellow-500/20">
        <p className="font-bold text-yellow-500">
          Final Choice: {estimatorName || reasoning.chosen.estimator_id.substring(0, 8)}
        </p>
        <p className="text-sm text-gray-400 mt-1">
          Weight: {formatWeight(reasoning.chosen.final_weight)}
        </p>
      </div>
    </Card>
  );
}

