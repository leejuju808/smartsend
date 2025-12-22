"use client";

import { useEffect, useState } from "react";
import { EstimatorScoreCard, EstimatorPerformanceData } from "@/components/estimators/EstimatorScoreCard";
import { useCurrentWorkspace } from "@/hooks/useCurrentWorkspace";
import { Button } from "@/components/ui/button";

export function EstimatorPerformanceScores() {
  const { workspace } = useCurrentWorkspace();
  const [scores, setScores] = useState<EstimatorPerformanceData[]>([]);
  const [estimators, setEstimators] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);

  useEffect(() => {
    if (workspace?.id) {
      loadPerformanceScores();
      loadEstimators();
    }
  }, [workspace?.id]);

  const loadPerformanceScores = async () => {
    if (!workspace?.id) return;

    try {
      setLoading(true);
      const response = await fetch(
        `/api/estimators/performance?workspace_id=${workspace.id}`
      );
      if (response.ok) {
        const data = await response.json();
        setScores(data.scores || []);
      }
    } catch (error) {
      console.error("Error loading performance scores:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadEstimators = async () => {
    if (!workspace?.id) return;

    try {
      const response = await fetch("/api/estimators/list");
      if (response.ok) {
        const data = await response.json();
        const estimatorMap: Record<string, string> = {};
        data.forEach((est: any) => {
          estimatorMap[est.id] = est.full_name || est.email || "Unknown";
        });
        setEstimators(estimatorMap);
      }
    } catch (error) {
      console.error("Error loading estimators:", error);
    }
  };

  const handleCalculate = async () => {
    if (!workspace?.id) return;

    try {
      setCalculating(true);
      const response = await fetch("/api/estimators/performance", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workspace_id: workspace.id,
        }),
      });

      if (response.ok) {
        // Reload scores after calculation
        await loadPerformanceScores();
      }
    } catch (error) {
      console.error("Error calculating performance:", error);
    } finally {
      setCalculating(false);
    }
  };

  if (loading) {
    return (
      <div className="p-4 rounded-2xl bg-white border">
        <div className="text-sm text-muted-foreground">Loading performance scores...</div>
      </div>
    );
  }

  if (scores.length === 0) {
    return (
      <div className="p-4 rounded-2xl bg-white border">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Estimator Performance Scores</h3>
          <Button onClick={handleCalculate} disabled={calculating} size="sm">
            {calculating ? "Calculating..." : "Calculate Scores"}
          </Button>
        </div>
        <div className="text-sm text-muted-foreground">
          No performance scores available. Click "Calculate Scores" to generate them.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Estimator Performance Scores</h3>
        <Button onClick={handleCalculate} disabled={calculating} size="sm" variant="outline">
          {calculating ? "Recalculating..." : "Recalculate"}
        </Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {scores.map((score) => (
          <EstimatorScoreCard
            key={score.id}
            score={score}
            estimatorName={estimators[score.estimator_id]}
          />
        ))}
      </div>
    </div>
  );
}









































