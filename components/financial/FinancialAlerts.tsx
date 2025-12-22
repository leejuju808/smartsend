"use client";

import * as React from "react";
import { Card } from "@/src/components/ui/Card";
import { Badge } from "@/src/components/ui/badge";
import { AlertTriangle, DollarSign, TrendingDown, Clock, AlertCircle } from "lucide-react";

interface FinancialAlert {
  type: string;
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  message: string;
  count?: number;
  forecast?: any;
}

interface FinancialAlertsProps {
  companyId: string;
  alerts?: FinancialAlert[];
  onAcknowledge?: (alertType: string) => void;
}

/**
 * Block 254200: Financial Alerts System
 * Shows financial warnings and alerts
 */
export function FinancialAlerts({ companyId, alerts = [], onAcknowledge }: FinancialAlertsProps) {
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical":
        return "text-red-600 bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800";
      case "high":
        return "text-amber-600 bg-amber-50 dark:bg-amber-950 border-amber-200 dark:border-amber-800";
      case "medium":
        return "text-yellow-600 bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800";
      default:
        return "text-blue-600 bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800";
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "low_margin":
        return <TrendingDown className="h-5 w-5" />;
      case "cost_overrun":
        return <AlertTriangle className="h-5 w-5" />;
      case "overdue_receivables":
        return <Clock className="h-5 w-5" />;
      case "cashflow_warning":
        return <DollarSign className="h-5 w-5" />;
      case "losing_money":
        return <AlertCircle className="h-5 w-5" />;
      default:
        return <AlertTriangle className="h-5 w-5" />;
    }
  };

  if (!alerts || alerts.length === 0) {
    return (
      <Card className="p-6">
        <div className="text-center text-muted-foreground">
          No financial alerts at this time.
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {alerts.map((alert, index) => (
        <Card
          key={index}
          className={`p-4 border ${getSeverityColor(alert.severity)}`}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3 flex-1">
              <div className="mt-0.5">{getIcon(alert.type)}</div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-semibold">{alert.title}</h4>
                  <Badge variant={alert.severity === "critical" ? "destructive" : "secondary"}>
                    {alert.severity}
                  </Badge>
                </div>
                <p className="text-sm opacity-90">{alert.message}</p>
                {alert.count !== undefined && (
                  <div className="mt-2 text-xs opacity-75">
                    {alert.count} {alert.count === 1 ? "item" : "items"} affected
                  </div>
                )}
              </div>
            </div>
            {onAcknowledge && (
              <button
                onClick={() => onAcknowledge(alert.type)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Dismiss
              </button>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}






















