"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";

type FunnelStep = {
  step_no: number;
  step_name: string;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  replied: number;
  percentage: number; // percentage of initial step
};

type SequenceFunnelProps = {
  campaignId: string;
};

export function SequenceFunnel({ campaignId }: SequenceFunnelProps) {
  const [steps, setSteps] = useState<FunnelStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalReplies, setTotalReplies] = useState(0);

  useEffect(() => {
    async function loadFunnel() {
      setLoading(true);
      try {
        const res = await fetch(`/api/campaigns/${campaignId}/steps/stats`);
        if (res.ok) {
          const data = await res.json();
          const stepStats = data.steps || [];
          
          if (stepStats.length === 0) {
            setSteps([]);
            setLoading(false);
            return;
          }

          const firstStepSent = stepStats[0]?.sent || 1;
          const funnelSteps: FunnelStep[] = stepStats.map((step: any, index: number) => {
            const percentage = firstStepSent > 0 
              ? Math.round((step.sent / firstStepSent) * 100) 
              : 0;
            return {
              step_no: step.step_no,
              step_name: step.step_name || `Step ${step.step_no}`,
              sent: step.sent,
              delivered: step.delivered,
              opened: step.opened,
              clicked: step.clicked,
              replied: step.replied,
              percentage,
            };
          });

          setSteps(funnelSteps);
          setTotalReplies(stepStats.reduce((sum: number, s: any) => sum + (s.replied || 0), 0));
        }
      } catch (error) {
        console.error("Failed to load funnel:", error);
      } finally {
        setLoading(false);
      }
    }

    if (campaignId) {
      loadFunnel();
    }
  }, [campaignId]);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="text-sm text-muted-foreground">Loading funnel...</div>
        </CardContent>
      </Card>
    );
  }

  if (steps.length === 0) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="text-sm text-muted-foreground">No funnel data available</div>
        </CardContent>
      </Card>
    );
  }

  const firstStepSent = steps[0]?.sent || 1;
  const totalReplyRate = firstStepSent > 0 
    ? ((totalReplies / firstStepSent) * 100).toFixed(1)
    : "0.0";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Sequence Funnel</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {steps.map((step, index) => {
          const dropOff = index > 0 
            ? steps[index - 1].sent - step.sent 
            : 0;
          const dropOffPercent = index > 0 && steps[index - 1].sent > 0
            ? ((dropOff / steps[index - 1].sent) * 100).toFixed(1)
            : "0.0";

          return (
            <div key={step.step_no} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">
                    {step.step_name || `Step ${step.step_no}`}
                  </span>
                  {index > 0 && dropOff > 0 && (
                    <span className="text-xs text-red-600">
                      ↓ {dropOff} ({dropOffPercent}% drop-off)
                    </span>
                  )}
                </div>
                <div className="text-sm font-medium">{step.percentage}%</div>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-4 relative overflow-hidden">
                <div
                  className="bg-blue-500 h-4 rounded-full transition-all"
                  style={{ width: `${step.percentage}%` }}
                />
              </div>
              <div className="text-xs text-muted-foreground grid grid-cols-4 gap-2">
                <div>Sent: {step.sent.toLocaleString()}</div>
                <div>Opened: {step.opened.toLocaleString()}</div>
                <div>Clicked: {step.clicked.toLocaleString()}</div>
                <div>Replied: {step.replied.toLocaleString()}</div>
              </div>
            </div>
          );
        })}

        <div className="border-t pt-4 mt-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Total Replies:</span>
            <span className="text-lg font-bold">{totalReplies.toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className="text-sm font-medium">Overall Reply Rate:</span>
            <span className="text-lg font-bold">{totalReplyRate}%</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}



