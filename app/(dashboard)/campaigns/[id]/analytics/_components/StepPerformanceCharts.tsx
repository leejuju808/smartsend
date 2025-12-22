"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CampaignAnalytics } from "../types";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

interface StepPerformanceChartsProps {
  steps: CampaignAnalytics["steps"];
}

export function StepPerformanceCharts({ steps }: StepPerformanceChartsProps) {
  // Prepare data for bar chart
  const chartData = steps.map((step) => ({
    name: step.stepName.length > 30 ? step.stepName.substring(0, 30) + "..." : step.stepName,
    fullName: step.stepName,
    deliveries: step.deliveries,
    replies: step.replies,
    hotLeads: step.hotLeads,
    warmLeads: step.warmLeads,
    replyRate: step.replyRate,
    hotRate: step.hotRate,
  }));

  return (
    <div className="space-y-6">
      {/* Step Performance Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {steps.map((step) => (
          <Card key={step.stepId || step.stepNo} className="rounded-lg">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">
                {step.stepName}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-muted-foreground">Delivered</p>
                  <p className="font-semibold">{step.deliveries.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Replies</p>
                  <p className="font-semibold text-green-600">
                    {step.replies} ({step.replyRate.toFixed(1)}%)
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Hot Leads</p>
                  <p className="font-semibold text-red-600">{step.hotLeads}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Warm Leads</p>
                  <p className="font-semibold text-orange-600">{step.warmLeads}</p>
                </div>
              </div>
              {step.customers > 0 && (
                <div className="pt-2 border-t">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Customers</span>
                    <span className="font-semibold text-emerald-600">{step.customers}</span>
                  </div>
                  {step.revenue > 0 && (
                    <div className="flex items-center justify-between text-sm mt-1">
                      <span className="text-muted-foreground">Revenue</span>
                      <span className="font-semibold text-emerald-600">
                        ${step.revenue.toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Bar Chart */}
      {chartData.length > 0 && (
        <Card className="rounded-lg">
          <CardHeader>
            <CardTitle>Step Performance Comparison</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="name"
                  angle={-45}
                  textAnchor="end"
                  height={100}
                  interval={0}
                />
                <YAxis />
                <Tooltip
                  formatter={(value: number, name: string) => {
                    if (name === "replyRate" || name === "hotRate") {
                      return [`${value.toFixed(1)}%`, name];
                    }
                    return [value.toLocaleString(), name];
                  }}
                  labelFormatter={(label) => {
                    const step = chartData.find((d) => d.name === label);
                    return step?.fullName || label;
                  }}
                />
                <Legend />
                <Bar dataKey="deliveries" fill="#3b82f6" name="Delivered" />
                <Bar dataKey="replies" fill="#10b981" name="Replies" />
                <Bar dataKey="hotLeads" fill="#ef4444" name="Hot Leads" />
                <Bar dataKey="warmLeads" fill="#f97316" name="Warm Leads" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

