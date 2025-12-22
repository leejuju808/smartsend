"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

interface EstimatorPerformanceSectionProps {
  estimators: Array<{
    estimator_id: string;
    performance_score: number;
    speed_score: number;
    followup_score: number;
    proposal_score: number;
    close_rate_score: number;
    tone_score: number;
    ai_alignment_score: number;
    calculated_at: string;
    name: string;
  }>;
}

export function EstimatorPerformanceSection({ estimators }: EstimatorPerformanceSectionProps) {
  const getPerformanceColor = (score: number) => {
    if (score >= 75) return "text-green-400";
    if (score >= 50) return "text-yellow-400";
    return "text-red-400";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>👥 Estimator Performance Snapshot</CardTitle>
        <p className="text-sm text-muted-foreground">
          Top performers and areas for improvement
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {estimators.map((estimator) => (
            <div key={estimator.estimator_id} className="p-4 rounded-lg border">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <div className="font-medium">{estimator.name}</div>
                  <div className="text-xs text-muted-foreground">
                    Updated {new Date(estimator.calculated_at).toLocaleDateString()}
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-2xl font-bold ${getPerformanceColor(estimator.performance_score)}`}>
                    {estimator.performance_score}
                  </div>
                  <div className="text-xs text-muted-foreground">Performance Score</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div>
                  <div className="text-muted-foreground">Speed</div>
                  <div className="font-medium">{estimator.speed_score}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Follow-up</div>
                  <div className="font-medium">{estimator.followup_score}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Close Rate</div>
                  <div className="font-medium">{estimator.close_rate_score}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}









































