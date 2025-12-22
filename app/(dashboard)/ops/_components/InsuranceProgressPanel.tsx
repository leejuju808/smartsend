"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/Badge";
import { Shield, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import Link from "next/link";

interface InsuranceJob {
  id: string;
  job_id: string;
  job_title: string;
  carrier: string | null;
  claim_number: string | null;
  acv_status: string | null;
  acv_amount: number | null;
  supplement_status: string | null;
  supplement_amount: number | null;
  depreciation_status: string | null;
  depreciation_owed: number | null;
  adjuster_visit_today: boolean;
  health_score: number | null;
  health_status: string | null;
  document_vault_complete: boolean;
}

interface InsuranceStats {
  total: number;
  acv_pending: number;
  acv_paid: number;
  supplements_pending: number;
  supplements_approved: number;
  depreciation_pending: number;
  adjuster_visits_today: number;
}

interface InsuranceProgressPanelProps {
  jobs: InsuranceJob[];
  stats: InsuranceStats;
}

export function InsuranceProgressPanel({
  jobs,
  stats,
}: InsuranceProgressPanelProps) {
  const formatCurrency = (value: number | null | undefined) => {
    if (!value) return "$0";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Insurance Progress
          </span>
          <Badge variant="secondary">{stats.total} jobs</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats Summary */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="p-2 bg-blue-50 rounded">
            <div className="font-semibold text-blue-700">
              {stats.acv_pending}
            </div>
            <div className="text-xs text-muted-foreground">ACV Pending</div>
          </div>
          <div className="p-2 bg-green-50 rounded">
            <div className="font-semibold text-green-700">{stats.acv_paid}</div>
            <div className="text-xs text-muted-foreground">ACV Paid</div>
          </div>
          <div className="p-2 bg-yellow-50 rounded">
            <div className="font-semibold text-yellow-700">
              {stats.supplements_pending}
            </div>
            <div className="text-xs text-muted-foreground">
              Supplements Pending
            </div>
          </div>
          <div className="p-2 bg-green-50 rounded">
            <div className="font-semibold text-green-700">
              {stats.supplements_approved}
            </div>
            <div className="text-xs text-muted-foreground">
              Supplements Approved
            </div>
          </div>
          <div className="p-2 bg-orange-50 rounded">
            <div className="font-semibold text-orange-700">
              {stats.depreciation_pending}
            </div>
            <div className="text-xs text-muted-foreground">
              Depreciation Pending
            </div>
          </div>
          {stats.adjuster_visits_today > 0 && (
            <div className="p-2 bg-purple-50 rounded">
              <div className="font-semibold text-purple-700">
                {stats.adjuster_visits_today}
              </div>
              <div className="text-xs text-muted-foreground">
                Adjuster Visits Today
              </div>
            </div>
          )}
        </div>

        {/* Recent Insurance Jobs */}
        {jobs.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Recent Insurance Jobs</h4>
            {jobs.slice(0, 3).map((job) => (
              <Link
                key={job.id}
                href={`/dashboard/jobs/${job.job_id}`}
                className="block p-3 border rounded-lg hover:bg-accent transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">
                      {job.job_title}
                    </div>
                    {job.carrier && (
                      <div className="text-xs text-muted-foreground">
                        {job.carrier}
                        {job.claim_number && ` - ${job.claim_number}`}
                      </div>
                    )}
                    <div className="flex gap-2 mt-1 flex-wrap">
                      {job.acv_status === "paid" && (
                        <Badge variant="default" className="bg-green-500 text-white text-xs">
                          ACV Paid
                        </Badge>
                      )}
                      {job.acv_status === "pending" && (
                        <Badge variant="default" className="bg-yellow-500 text-white text-xs">
                          ACV Pending
                        </Badge>
                      )}
                      {job.supplement_status === "approved" && (
                        <Badge variant="default" className="bg-green-500 text-white text-xs">
                          Supplement Approved
                        </Badge>
                      )}
                      {job.depreciation_status === "pending" && (
                        <Badge variant="default" className="bg-orange-500 text-white text-xs">
                          Depreciation Pending
                        </Badge>
                      )}
                    </div>
                  </div>
                  {job.health_score !== null && (
                    <div className="text-xs">
                      <div className="font-semibold">{Math.round(job.health_score)}</div>
                      <div className="text-muted-foreground">Health</div>
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}






































