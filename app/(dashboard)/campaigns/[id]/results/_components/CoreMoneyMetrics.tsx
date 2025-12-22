"use client";

import { Card } from "@/components/ui/card";

interface CoreMoneyMetricsProps {
  emailsSent: number;
  repliesReceived: number;
  hotLeads: number;
  estimatedJobValue: number;
}

export function CoreMoneyMetrics({
  emailsSent,
  repliesReceived,
  hotLeads,
  estimatedJobValue,
}: CoreMoneyMetricsProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">Core Money Metrics</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-6">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Emails Sent</p>
            <p className="text-3xl font-bold">{emailsSent.toLocaleString()}</p>
          </div>
        </Card>

        <Card className="p-6">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Replies Received</p>
            <p className="text-3xl font-bold text-blue-600">
              {repliesReceived.toLocaleString()}
            </p>
          </div>
        </Card>

        <Card className="p-6">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Hot Leads</p>
            <p className="text-3xl font-bold text-red-600">
              {hotLeads.toLocaleString()}
            </p>
          </div>
        </Card>

        <Card className="p-6 bg-gradient-to-br from-green-50 to-emerald-50 border-green-200">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Estimated Job Value</p>
            <p className="text-3xl font-bold text-green-700">
              {formatCurrency(estimatedJobValue)}+
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}





















































