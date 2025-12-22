"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { AlertCircle, AlertTriangle, Info, X } from "lucide-react";
import Link from "next/link";

type Alert = {
  id: string;
  type: "warning" | "critical" | "info";
  title: string;
  message: string;
  metric: string;
  value: number | string;
  threshold: number | string;
  actionUrl?: string;
};

type AlertsData = {
  alerts: Alert[];
  summary: {
    total: number;
    critical: number;
    warnings: number;
    info: number;
  };
};

export default function CEOAlerts({ workspaceId }: { workspaceId: string | null }) {
  const [alertsData, setAlertsData] = useState<AlertsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!workspaceId) {
      setLoading(false);
      return;
    }

    const loadAlerts = async () => {
      try {
        const res = await fetch(`/api/analytics/ceo-dashboard/alerts?wid=${workspaceId}`);
        if (!res.ok) throw new Error("Failed to fetch alerts");
        const data = await res.json();
        setAlertsData(data);
      } catch (error) {
        console.error("Error loading alerts:", error);
      } finally {
        setLoading(false);
      }
    };

    loadAlerts();
    // Refresh alerts every 5 minutes
    const interval = setInterval(loadAlerts, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [workspaceId]);

  const handleDismiss = (alertId: string) => {
    setDismissed(prev => new Set(prev).add(alertId));
  };

  if (loading || !alertsData || alertsData.alerts.length === 0) {
    return null;
  }

  const activeAlerts = alertsData.alerts.filter(alert => !dismissed.has(alert.id));

  if (activeAlerts.length === 0) {
    return null;
  }

  const getAlertIcon = (type: string) => {
    switch (type) {
      case "critical":
        return <AlertCircle className="h-5 w-5 text-red-600" />;
      case "warning":
        return <AlertTriangle className="h-5 w-5 text-yellow-600" />;
      case "info":
        return <Info className="h-5 w-5 text-blue-600" />;
      default:
        return null;
    }
  };

  const getAlertColor = (type: string) => {
    switch (type) {
      case "critical":
        return "border-red-300 bg-red-50";
      case "warning":
        return "border-yellow-300 bg-yellow-50";
      case "info":
        return "border-blue-300 bg-blue-50";
      default:
        return "border-gray-300 bg-gray-50";
    }
  };

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Active Alerts ({activeAlerts.length})
          </div>
          {alertsData.summary.critical > 0 && (
            <span className="px-2 py-1 rounded text-xs bg-red-100 text-red-800">
              {alertsData.summary.critical} Critical
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {activeAlerts.map((alert) => (
          <div
            key={alert.id}
            className={`p-4 rounded-lg border ${getAlertColor(alert.type)}`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 flex-1">
                {getAlertIcon(alert.type)}
                <div className="flex-1">
                  <h4 className="font-semibold text-sm mb-1">{alert.title}</h4>
                  <p className="text-sm text-muted-foreground mb-2">{alert.message}</p>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>
                      <strong>{alert.metric}:</strong> {alert.value}
                    </span>
                    <span>
                      <strong>Threshold:</strong> {alert.threshold}
                    </span>
                  </div>
                  {alert.actionUrl && (
                    <Link
                      href={alert.actionUrl}
                      className="text-xs text-primary hover:underline mt-2 inline-block"
                    >
                      View Details →
                    </Link>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleDismiss(alert.id)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

























