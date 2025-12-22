"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/Badge";
import { TrendingUp, DollarSign, Calendar } from "lucide-react";

interface RevenueData {
  this_week?: {
    jobs_completed?: number;
    revenue_collected?: number;
    outstanding_payments?: number;
  };
  this_month?: {
    total_revenue?: number;
    forecasted_revenue?: number;
    average_job_value?: number;
  };
  pipeline?: {
    lead_in?: number;
    inspections_set?: number;
    quotes_sent?: number;
    approved?: number;
    scheduled?: number;
  };
}

interface RevenueTrackingPanelProps {
  revenue: RevenueData;
}

export function RevenueTrackingPanel({ revenue }: RevenueTrackingPanelProps) {
  const formatCurrency = (value: number | undefined) => {
    if (!value) return "$0";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value);
  };

  const thisWeek = revenue.this_week || {};
  const thisMonth = revenue.this_month || {};
  const pipeline = revenue.pipeline || {};

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="w-5 h-5" />
          Revenue Tracking
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* This Week */}
        <div>
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            This Week
          </h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-2xl font-bold">
                {thisWeek.jobs_completed || 0}
              </div>
              <div className="text-xs text-muted-foreground">
                Jobs Completed
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(thisWeek.revenue_collected)}
              </div>
              <div className="text-xs text-muted-foreground">
                Revenue Collected
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold text-orange-600">
                {formatCurrency(thisWeek.outstanding_payments)}
              </div>
              <div className="text-xs text-muted-foreground">
                Outstanding
              </div>
            </div>
          </div>
        </div>

        {/* This Month */}
        <div>
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            This Month
          </h3>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(thisMonth.total_revenue)}
              </div>
              <div className="text-xs text-muted-foreground">
                Total Revenue
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold text-blue-600">
                {formatCurrency(thisMonth.forecasted_revenue)}
              </div>
              <div className="text-xs text-muted-foreground">
                Forecasted
              </div>
            </div>
            <div>
              <div className="text-2xl font-bold">
                {formatCurrency(thisMonth.average_job_value)}
              </div>
              <div className="text-xs text-muted-foreground">
                Avg Job Value
              </div>
            </div>
          </div>
        </div>

        {/* Pipeline Revenue */}
        <div>
          <h3 className="text-sm font-semibold mb-3">Pipeline Revenue</h3>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Lead In</span>
              <span className="font-semibold">
                {formatCurrency(pipeline.lead_in)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">
                Inspections Set
              </span>
              <span className="font-semibold">
                {formatCurrency(pipeline.inspections_set)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Quotes Sent</span>
              <span className="font-semibold">
                {formatCurrency(pipeline.quotes_sent)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Approved</span>
              <span className="font-semibold text-green-600">
                {formatCurrency(pipeline.approved)}
              </span>
            </div>
            <div className="flex justify-between items-center border-t pt-2">
              <span className="text-sm font-semibold">Scheduled</span>
              <span className="font-bold text-blue-600">
                {formatCurrency(pipeline.scheduled)}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}






































