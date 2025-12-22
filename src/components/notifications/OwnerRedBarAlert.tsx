/**
 * OwnerRedBarAlert Component
 * Displays persistent red bar alerts at the top of owner view
 * Shows critical alerts that owners must never miss
 */

"use client";

import { useEffect, useState } from "react";
import { X, AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";

interface RedBarAlert {
  id: string;
  title: string;
  message: string;
  alert_type: string;
  job_id?: string;
  lead_id?: string;
  thread_id?: string;
  created_at: string;
}

export function OwnerRedBarAlert() {
  const router = useRouter();
  const [alerts, setAlerts] = useState<RedBarAlert[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchRedBarAlerts();
  }, []);

  const fetchRedBarAlerts = async () => {
    try {
      const response = await fetch("/api/notifications/red-bar-alerts");
      const data = await response.json();
      setAlerts(data.data || []);
    } catch (error) {
      console.error("Error fetching red bar alerts:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResolve = async (alertId: string) => {
    try {
      const response = await fetch(
        `/api/notifications/red-bar-alerts/${alertId}/resolve`,
        {
          method: "POST",
        }
      );

      if (response.ok) {
        setAlerts((prev) => prev.filter((a) => a.id !== alertId));
      }
    } catch (error) {
      console.error("Error resolving alert:", error);
    }
  };

  const handleClick = (alert: RedBarAlert) => {
    if (alert.job_id) {
      router.push(`/jobs/${alert.job_id}`);
    } else if (alert.thread_id) {
      router.push(`/inbox/replies?threadId=${alert.thread_id}`);
    } else if (alert.lead_id) {
      router.push(`/leads/${alert.lead_id}`);
    }
  };

  if (isLoading || alerts.length === 0) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50">
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className="bg-red-600 text-white px-4 py-3 shadow-lg border-b border-red-700"
        >
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div
              className="flex items-center gap-3 flex-1 cursor-pointer"
              onClick={() => handleClick(alert)}
            >
              <AlertTriangle className="h-5 w-5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm">{alert.title}</div>
                <div className="text-xs text-red-100 mt-0.5">{alert.message}</div>
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleResolve(alert.id);
              }}
              className="ml-4 p-1 hover:bg-red-700 rounded transition-colors"
              aria-label="Dismiss alert"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}






































