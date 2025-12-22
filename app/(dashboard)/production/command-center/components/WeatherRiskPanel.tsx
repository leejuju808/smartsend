"use client";

// Block 246000 — Weather Risk Panel
// Shows: Today's rain probability, Tomorrow forecast, Jobs at weather risk, Auto-recommend reschedule

import { Cloud, CloudRain, AlertTriangle, Calendar } from "lucide-react";
import Link from "next/link";

interface WeatherAlert {
  id: string;
  type: string;
  severity: string;
  message: string;
  metadata: any;
  created_at: string;
  job_id: string | null;
  jobs?: {
    id: string;
    title: string;
    address: string;
    scheduled_start_date: string | null;
  } | null;
}

interface WeatherRiskPanelProps {
  weatherAlerts: WeatherAlert[];
}

export function WeatherRiskPanel({ weatherAlerts }: WeatherRiskPanelProps) {
  const activeAlerts = weatherAlerts.filter(a => !a.is_resolved);

  return (
    <div className="bg-zinc-900/50 rounded-xl border border-zinc-800 p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Cloud className="h-5 w-5 text-yellow-400" />
          <h2 className="text-lg font-semibold text-white">Weather Risk</h2>
        </div>
        <div className="text-xs text-zinc-400">
          {activeAlerts.length} active alerts
        </div>
      </div>

      <div className="space-y-3">
        {activeAlerts.length === 0 ? (
          <div className="text-center text-zinc-500 text-sm py-8">
            <CloudRain className="h-8 w-8 mx-auto mb-2 text-zinc-600" />
            <div>No weather risks detected</div>
            <div className="text-xs mt-1">All jobs are clear</div>
          </div>
        ) : (
          activeAlerts.map((alert) => (
            <div
              key={alert.id}
              className={`rounded-lg border p-3 ${
                alert.severity === 'critical'
                  ? 'bg-red-500/10 border-red-500/30'
                  : alert.severity === 'warning'
                  ? 'bg-yellow-500/10 border-yellow-500/30'
                  : 'bg-blue-500/10 border-blue-500/30'
              }`}
            >
              <div className="flex items-start gap-2">
                <AlertTriangle
                  className={`h-5 w-5 flex-shrink-0 mt-0.5 ${
                    alert.severity === 'critical'
                      ? 'text-red-400'
                      : alert.severity === 'warning'
                      ? 'text-yellow-400'
                      : 'text-blue-400'
                  }`}
                />
                <div className="flex-1 min-w-0">
                  {alert.jobs && (
                    <Link href={`/production/jobs/${alert.jobs.id}`}>
                      <div className="font-medium text-white text-sm hover:text-blue-400 mb-1">
                        {alert.jobs.title || alert.jobs.address}
                      </div>
                    </Link>
                  )}
                  <div className="text-sm text-zinc-300 mb-2">{alert.message}</div>
                  {alert.jobs?.scheduled_start_date && (
                    <div className="flex items-center gap-1 text-xs text-zinc-400">
                      <Calendar className="h-3 w-3" />
                      <span>
                        Scheduled: {new Date(alert.jobs.scheduled_start_date).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                  {alert.metadata?.rain_probability && (
                    <div className="text-xs text-zinc-400 mt-1">
                      Rain probability: {alert.metadata.rain_probability}%
                    </div>
                  )}
                  <div className="mt-2">
                    <button className="text-xs text-blue-400 hover:text-blue-300 underline">
                      Recommend reschedule
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

























