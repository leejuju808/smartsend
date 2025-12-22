"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/Badge";
import { Activity, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import Link from "next/link";

interface JobHealthData {
  healthy?: {
    count?: number;
    jobs?: any[];
  };
  needs_attention?: {
    count?: number;
    jobs?: any[];
  };
  at_risk?: {
    count?: number;
    jobs?: any[];
  };
}

interface JobHealthPanelProps {
  health: JobHealthData;
}

export function JobHealthPanel({ health }: JobHealthPanelProps) {
  const healthy = health.healthy || {};
  const needsAttention = health.needs_attention || {};
  const atRisk = health.at_risk || {};

  const totalJobs =
    (healthy.count || 0) +
    (needsAttention.count || 0) +
    (atRisk.count || 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="w-5 h-5" />
          Job Health Overview
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Health Distribution */}
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <div className="flex items-center justify-center gap-2 mb-2">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              <div className="text-3xl font-bold text-green-600">
                {healthy.count || 0}
              </div>
            </div>
            <div className="text-sm font-semibold text-green-700">Healthy</div>
            <div className="text-xs text-muted-foreground">80-100</div>
          </div>

          <div className="text-center p-4 bg-yellow-50 rounded-lg">
            <div className="flex items-center justify-center gap-2 mb-2">
              <AlertTriangle className="w-5 h-5 text-yellow-600" />
              <div className="text-3xl font-bold text-yellow-600">
                {needsAttention.count || 0}
              </div>
            </div>
            <div className="text-sm font-semibold text-yellow-700">
              Needs Attention
            </div>
            <div className="text-xs text-muted-foreground">60-79</div>
          </div>

          <div className="text-center p-4 bg-red-50 rounded-lg">
            <div className="flex items-center justify-center gap-2 mb-2">
              <XCircle className="w-5 h-5 text-red-600" />
              <div className="text-3xl font-bold text-red-600">
                {atRisk.count || 0}
              </div>
            </div>
            <div className="text-sm font-semibold text-red-700">At Risk</div>
            <div className="text-xs text-muted-foreground">0-59</div>
          </div>
        </div>

        {/* Jobs Needing Attention */}
        {needsAttention.jobs && needsAttention.jobs.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-600" />
              Needs Attention ({needsAttention.count})
            </h4>
            <div className="space-y-2">
              {needsAttention.jobs.slice(0, 5).map((job: any) => (
                <Link
                  key={job.job_id}
                  href={`/dashboard/jobs/${job.job_id}`}
                  className="block p-3 border border-yellow-200 rounded-lg hover:bg-yellow-50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="font-medium text-sm">{job.title}</div>
                      {job.issues && job.issues.length > 0 && (
                        <div className="text-xs text-muted-foreground mt-1">
                          {job.issues
                            .slice(0, 2)
                            .map((issue: any) => issue.issue_type)
                            .join(", ")}
                        </div>
                      )}
                    </div>
                    <Badge variant="default" className="bg-yellow-500 text-white">
                      {Math.round(job.health_score)}
                    </Badge>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* At Risk Jobs */}
        {atRisk.jobs && atRisk.jobs.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
              <XCircle className="w-4 h-4 text-red-600" />
              At Risk ({atRisk.count})
            </h4>
            <div className="space-y-2">
              {atRisk.jobs.slice(0, 5).map((job: any) => (
                <Link
                  key={job.job_id}
                  href={`/dashboard/jobs/${job.job_id}`}
                  className="block p-3 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="font-medium text-sm">{job.title}</div>
                      {job.issues && job.issues.length > 0 && (
                        <div className="text-xs text-muted-foreground mt-1">
                          {job.issues
                            .slice(0, 2)
                            .map((issue: any) => issue.issue_type)
                            .join(", ")}
                        </div>
                      )}
                    </div>
                    <Badge variant="destructive">
                      {Math.round(job.health_score)}
                    </Badge>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}






































