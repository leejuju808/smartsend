"use client";

import { Card } from "@/components/ui/card";

interface ROIBreakdownProps {
  hotLeads: number;
  hotValue: number;
  warmLeads: number;
  warmValue: number;
  followUpLeads: number;
  followUpValue: number;
  newLeads: number;
  newValue: number;
  totalEstimatedValue: number;
}

export function ROIBreakdown({
  hotLeads,
  hotValue,
  warmLeads,
  warmValue,
  followUpLeads,
  followUpValue,
  newLeads,
  newValue,
  totalEstimatedValue,
}: ROIBreakdownProps) {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const breakdown = [
    {
      label: "Hot Leads",
      count: hotLeads,
      value: hotValue,
      color: "text-red-600",
      bgColor: "bg-red-50",
    },
    {
      label: "Warm Leads",
      count: warmLeads,
      value: warmValue,
      color: "text-yellow-600",
      bgColor: "bg-yellow-50",
    },
    {
      label: "Follow-Ups",
      count: followUpLeads,
      value: followUpValue,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
    },
    {
      label: "New",
      count: newLeads,
      value: newValue,
      color: "text-gray-600",
      bgColor: "bg-gray-50",
    },
  ];

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">ROI Breakdown</h2>
      <Card className="p-6">
        <div className="space-y-4">
          {breakdown.map((item) => (
            <div
              key={item.label}
              className={`flex items-center justify-between p-4 rounded-lg ${item.bgColor}`}
            >
              <div className="flex items-center gap-3">
                <span className={`font-semibold ${item.color}`}>
                  {item.label} ({item.count}) →
                </span>
              </div>
              <span className={`text-lg font-bold ${item.color}`}>
                {formatCurrency(item.value)} potential
              </span>
            </div>
          ))}
          <div className="pt-4 border-t mt-4">
            <div className="flex items-center justify-between">
              <span className="text-lg font-semibold">Total Estimated Value</span>
              <span className="text-3xl font-bold text-green-700">
                {formatCurrency(totalEstimatedValue)}
              </span>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

