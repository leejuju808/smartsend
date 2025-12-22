"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

interface RevenueSectionProps {
  pulse: {
    revenue_today: number;
    revenue_last_7_days: number;
  };
}

export function RevenueSection({ pulse }: RevenueSectionProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>💰 Daily Revenue Picture</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">Revenue Today</div>
            <div className="text-3xl font-bold text-green-400">
              {formatCurrency(pulse.revenue_today)}
            </div>
            <div className="text-xs text-muted-foreground">
              Jobs won today
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">Revenue Last 7 Days</div>
            <div className="text-3xl font-bold">
              {formatCurrency(pulse.revenue_last_7_days)}
            </div>
            <div className="text-xs text-muted-foreground">
              Total revenue this week
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}









































