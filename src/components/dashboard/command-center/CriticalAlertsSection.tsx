// Section 4 — Critical Alerts

"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, AlertCircle, Info } from "lucide-react";
import Link from "next/link";

interface CriticalAlertsSectionProps {
  alerts: Array<{
    type: string;
    severity: string;
    message: string;
    lead_id?: string;
    estimator_id?: string;
  }>;
}

export function CriticalAlertsSection({ alerts }: CriticalAlertsSectionProps) {
  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case "high":
        return <AlertTriangle className="h-5 w-5 text-red-500" />;
      case "medium":
        return <AlertCircle className="h-5 w-5 text-yellow-500" />;
      default:
        return <Info className="h-5 w-5 text-blue-500" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "high":
        return "border-red-500 bg-red-500/10";
      case "medium":
        return "border-yellow-500 bg-yellow-500/10";
      default:
        return "border-blue-500 bg-blue-500/10";
    }
  };

  if (alerts.length === 0) {
    return (
      <div>
        <h2 className="text-2xl font-bold mb-4 text-white">Critical Alerts</h2>
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="p-6">
            <p className="text-gray-400 text-sm">No critical alerts. Everything looks good!</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-2xl font-bold mb-4 text-white">Critical Alerts</h2>
      <Card className="bg-gray-900 border-gray-800">
        <CardContent className="p-4">
          <div className="space-y-2">
            {alerts.map((alert, index) => (
              <div
                key={index}
                className={`p-3 rounded-lg border ${getSeverityColor(alert.severity)}`}
              >
                <div className="flex items-start gap-3">
                  {getSeverityIcon(alert.severity)}
                  <div className="flex-1">
                    <div className="text-white text-sm font-medium">{alert.message}</div>
                    {alert.lead_id && (
                      <Link
                        href={`/leads/${alert.lead_id}`}
                        className="text-xs text-blue-400 hover:underline mt-1"
                      >
                        View Lead →
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}









































