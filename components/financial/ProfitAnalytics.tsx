"use client";

import * as React from "react";
import { Card } from "@/src/components/ui/Card";
import { Badge } from "@/src/components/ui/badge";
import { BarChart3, Users, Wrench, Truck } from "lucide-react";

interface ProfitByCrew {
  crew_id: string;
  crew_name: string;
  job_count: number;
  total_revenue: number;
  total_costs: number;
  total_profit: number;
  avg_margin: number;
}

interface ProfitByJobType {
  job_type: string;
  job_count: number;
  total_revenue: number;
  total_costs: number;
  total_profit: number;
  avg_margin: number;
}

interface ProfitBySupplier {
  supplier_id: string;
  supplier_name: string;
  job_count: number;
  total_spent: number;
  total_revenue: number;
  total_profit: number;
  overrun_count: number;
}

interface ProfitAnalyticsProps {
  companyId: string;
  crew?: ProfitByCrew[];
  jobType?: ProfitByJobType[];
  supplier?: ProfitBySupplier[];
}

/**
 * Block 254200: Profit Analytics Dashboard
 * Shows profit by crew, job type, and supplier
 */
export function ProfitAnalytics({ companyId, crew = [], jobType = [], supplier = [] }: ProfitAnalyticsProps) {
  const getMarginColor = (margin: number) => {
    if (margin >= 40) return "text-green-600";
    if (margin >= 30) return "text-green-500";
    if (margin >= 20) return "text-yellow-600";
    return "text-red-600";
  };

  return (
    <div className="space-y-6">
      {/* Profit by Crew */}
      {crew.length > 0 && (
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Users className="h-5 w-5 text-muted-foreground" />
            <h3 className="text-lg font-semibold">Profit by Crew</h3>
          </div>
          <div className="space-y-3">
            {crew.map((c) => (
              <div key={c.crew_id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <div className="flex-1">
                  <div className="font-medium">{c.crew_name}</div>
                  <div className="text-sm text-muted-foreground">
                    {c.job_count} {c.job_count === 1 ? "job" : "jobs"}
                  </div>
                </div>
                <div className="text-right">
                  <div className={`font-bold ${getMarginColor(c.avg_margin)}`}>
                    {c.avg_margin.toFixed(1)}% avg margin
                  </div>
                  <div className="text-sm text-muted-foreground">
                    ${c.total_profit.toLocaleString()} profit
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Profit by Job Type */}
      {jobType.length > 0 && (
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Wrench className="h-5 w-5 text-muted-foreground" />
            <h3 className="text-lg font-semibold">Profit by Job Type</h3>
          </div>
          <div className="space-y-3">
            {jobType.map((jt) => (
              <div key={jt.job_type} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <div className="flex-1">
                  <div className="font-medium capitalize">{jt.job_type.replace(/_/g, " ")}</div>
                  <div className="text-sm text-muted-foreground">
                    {jt.job_count} {jt.job_count === 1 ? "job" : "jobs"}
                  </div>
                </div>
                <div className="text-right">
                  <div className={`font-bold ${getMarginColor(jt.avg_margin)}`}>
                    {jt.avg_margin.toFixed(1)}% margin
                  </div>
                  <div className="text-sm text-muted-foreground">
                    ${jt.total_profit.toLocaleString()} profit
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Profit by Supplier */}
      {supplier.length > 0 && (
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Truck className="h-5 w-5 text-muted-foreground" />
            <h3 className="text-lg font-semibold">Profit by Supplier</h3>
          </div>
          <div className="space-y-3">
            {supplier.map((s) => (
              <div key={s.supplier_id} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <div className="flex-1">
                  <div className="font-medium">{s.supplier_name}</div>
                  <div className="text-sm text-muted-foreground">
                    {s.job_count} {s.job_count === 1 ? "job" : "jobs"}
                    {s.overrun_count > 0 && (
                      <Badge variant="destructive" className="ml-2">
                        {s.overrun_count} overruns
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold">
                    ${s.total_profit.toLocaleString()} profit
                  </div>
                  <div className="text-sm text-muted-foreground">
                    ${s.total_spent.toLocaleString()} spent
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {crew.length === 0 && jobType.length === 0 && supplier.length === 0 && (
        <Card className="p-6">
          <div className="text-center text-muted-foreground">
            No profit analytics data available yet.
          </div>
        </Card>
      )}
    </div>
  );
}






















