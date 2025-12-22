"use client";

import { CashflowForecastPanel } from "./_components/CashflowForecastPanel";
import { CashCertaintyPanel } from "./_components/CashCertaintyPanel";

export default function CashflowDashboardPage() {
  return (
    <div className="container mx-auto py-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Cashflow Forecast</h1>
        <p className="text-muted-foreground mt-2">
          Predict future cashflow and identify potential cashflow gaps before they happen.
        </p>
      </div>

      <CashCertaintyPanel />
      <CashflowForecastPanel />
    </div>
  );
}


































