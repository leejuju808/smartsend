"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Calendar, 
  AlertTriangle, 
  Package, 
  DollarSign, 
  TrendingUp 
} from "lucide-react";

interface ProductionDashboardProps {
  metrics: {
    jobs_this_week?: number;
    jobs_behind_schedule?: number;
    jobs_awaiting_materials?: number;
    jobs_ready_for_payment?: number;
    completion_rate?: number;
  } | null;
}

export function ProductionDashboard({ metrics }: ProductionDashboardProps) {
  if (!metrics) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-4">
              <div className="h-16 bg-muted rounded" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const stats = [
    {
      label: "Jobs This Week",
      value: metrics.jobs_this_week || 0,
      icon: Calendar,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
    },
    {
      label: "Behind Schedule",
      value: metrics.jobs_behind_schedule || 0,
      icon: AlertTriangle,
      color: "text-red-600",
      bgColor: "bg-red-50",
    },
    {
      label: "Awaiting Materials",
      value: metrics.jobs_awaiting_materials || 0,
      icon: Package,
      color: "text-orange-600",
      bgColor: "bg-orange-50",
    },
    {
      label: "Ready for Payment",
      value: metrics.jobs_ready_for_payment || 0,
      icon: DollarSign,
      color: "text-green-600",
      bgColor: "bg-green-50",
    },
    {
      label: "Completion Rate",
      value: `${metrics.completion_rate || 0}%`,
      icon: TrendingUp,
      color: "text-purple-600",
      bgColor: "bg-purple-50",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
      {stats.map((stat) => {
        const Icon = stat.icon;
        return (
          <Card key={stat.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">
                {stat.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                  <Icon className={`h-5 w-5 ${stat.color}`} />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stat.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}


































