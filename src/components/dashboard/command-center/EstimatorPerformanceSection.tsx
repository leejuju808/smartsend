// Section 3 — Estimator Performance Snapshot

"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { User, Clock, XCircle, CheckCircle, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface EstimatorPerformanceSectionProps {
  snapshots: Array<{
    estimator_id: string;
    name?: string;
    avg_response_time_seconds?: number;
    missed_followups: number;
    jobs_won: number;
    jobs_lost: number;
    hot_leads_assigned: number;
    performance_badge: string;
  }>;
}

export function EstimatorPerformanceSection({ snapshots }: EstimatorPerformanceSectionProps) {
  const formatTime = (seconds?: number) => {
    if (!seconds) return "N/A";
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    return `${Math.round(seconds / 3600)}h`;
  };

  const getBadgeColor = (badge: string) => {
    switch (badge) {
      case "A":
        return "bg-green-500";
      case "B":
        return "bg-blue-500";
      case "C":
        return "bg-yellow-500";
      default:
        return "bg-red-500";
    }
  };

  if (snapshots.length === 0) {
    return (
      <div>
        <h2 className="text-2xl font-bold mb-4 text-white">Estimator Performance Snapshot</h2>
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="p-6">
            <p className="text-gray-400 text-sm">No estimator activity today.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4 text-white">Estimator Performance Snapshot</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {snapshots.map((snapshot) => (
          <Card key={snapshot.estimator_id} className="bg-gray-900 border-gray-800">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-white">
                  <User className="h-5 w-5 text-blue-500" />
                  {snapshot.name || "Unknown Estimator"}
                </CardTitle>
                <Badge className={getBadgeColor(snapshot.performance_badge)}>
                  {snapshot.performance_badge}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400 flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  Avg Response
                </span>
                <span className="text-white font-medium">
                  {formatTime(snapshot.avg_response_time_seconds)}
                </span>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400 flex items-center gap-1">
                  <AlertCircle className="h-4 w-4" />
                  Missed Follow-ups
                </span>
                <span className={`font-medium ${snapshot.missed_followups > 0 ? "text-red-400" : "text-green-400"}`}>
                  {snapshot.missed_followups}
                </span>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400 flex items-center gap-1">
                  <CheckCircle className="h-4 w-4" />
                  Jobs Won
                </span>
                <span className="text-green-400 font-medium">{snapshot.jobs_won}</span>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400 flex items-center gap-1">
                  <XCircle className="h-4 w-4" />
                  Jobs Lost
                </span>
                <span className="text-red-400 font-medium">{snapshot.jobs_lost}</span>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-400">Hot Leads Assigned</span>
                <span className="text-orange-400 font-medium">{snapshot.hot_leads_assigned}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}









































