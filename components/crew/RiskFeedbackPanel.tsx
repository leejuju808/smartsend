// Block 63000 — SmartSend Roofing Risk Detection + Warranty Liability AI System v1
// Crew App Risk Feedback Component
// Shows AI-detected risks to crew members

"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle, XCircle } from "lucide-react";

interface RiskAlert {
  id: string;
  alert_type: string;
  message: string;
  severity: "low" | "medium" | "high" | "critical";
  related_checklist_item?: string;
  created_at: string;
}

interface RiskFeedbackPanelProps {
  jobId: string;
}

export function RiskFeedbackPanel({ jobId }: RiskFeedbackPanelProps) {
  const [alerts, setAlerts] = useState<RiskAlert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRiskAlerts();
  }, [jobId]);

  const loadRiskAlerts = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/risk/job/${jobId}/alerts`);
      if (res.ok) {
        const data = await res.json();
        setAlerts(data.alerts || []);
      }
    } catch (error) {
      console.error("Error loading risk alerts:", error);
    } finally {
      setLoading(false);
    }
  };

  const getSeverityColor = (severity: string): string => {
    switch (severity) {
      case "critical":
        return "bg-red-500/20 text-red-300 border-red-500/40";
      case "high":
        return "bg-orange-500/20 text-orange-300 border-orange-500/40";
      case "medium":
        return "bg-yellow-500/20 text-yellow-300 border-yellow-500/40";
      default:
        return "bg-blue-500/20 text-blue-300 border-blue-500/40";
    }
  };

  if (loading) {
    return (
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4">
        <div className="text-sm text-zinc-400">Loading risk feedback...</div>
      </div>
    );
  }

  const activeAlerts = alerts.filter(a => !a.resolved);

  if (activeAlerts.length === 0) {
    return null; // Don't show panel if no alerts
  }

  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-5 h-5 text-amber-400" />
        <h3 className="text-sm font-semibold text-white">
          AI Risk Detection Feedback
        </h3>
      </div>
      <p className="text-xs text-zinc-400">
        SmartSend detected potential issues from your photos. Please review and address:
      </p>
      
      <div className="space-y-2">
        {activeAlerts.map((alert) => (
          <div
            key={alert.id}
            className={`p-3 rounded-lg border ${getSeverityColor(alert.severity)}`}
          >
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <div className="text-sm font-medium mb-1">{alert.message}</div>
                {alert.related_checklist_item && (
                  <div className="text-xs opacity-75 mt-1">
                    Related to: {alert.related_checklist_item}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
      
      <div className="text-xs text-zinc-500 pt-2 border-t border-zinc-800">
        💡 Tip: Review these areas before marking the job complete to prevent callbacks.
      </div>
    </div>
  );
}




























