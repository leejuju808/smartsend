"use client";

import { ArrowRight } from "lucide-react";

type Funnel = {
  newLeads: number;
  inspections: number;
  estimates: number;
  jobsWon: number;
};

const formatNumber = (num: number) => {
  return new Intl.NumberFormat("en-US").format(num);
};

const calculateConversionRate = (current: number, previous: number) => {
  if (previous === 0) return 0;
  return Math.round((current / previous) * 100);
};

export function RevenueFunnel({ funnel }: { funnel: Funnel }) {
  const stages = [
    {
      label: "New Leads",
      count: funnel.newLeads,
      conversionRate: null,
    },
    {
      label: "Inspections",
      count: funnel.inspections,
      conversionRate: calculateConversionRate(funnel.inspections, funnel.newLeads),
    },
    {
      label: "Estimates",
      count: funnel.estimates,
      conversionRate: calculateConversionRate(funnel.estimates, funnel.inspections),
    },
    {
      label: "Jobs Won",
      count: funnel.jobsWon,
      conversionRate: calculateConversionRate(funnel.jobsWon, funnel.estimates),
    },
  ];

  return (
    <div className="flex flex-col md:flex-row items-center justify-between gap-4 py-4">
      {stages.map((stage, index) => (
        <div key={stage.label} className="flex items-center gap-2">
          <div className="text-center min-w-[120px]">
            <div className="text-2xl font-bold">{formatNumber(stage.count)}</div>
            <div className="text-sm text-muted-foreground">{stage.label}</div>
            {stage.conversionRate !== null && (
              <div className="text-xs text-muted-foreground mt-1">
                {stage.conversionRate}% conversion
              </div>
            )}
          </div>
          {index < stages.length - 1 && (
            <ArrowRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
          )}
        </div>
      ))}
    </div>
  );
}




























































