/**
 * DailySummaryCard Component
 * Displays daily morning summary with jobs, payments, insurance, weather, tasks, and leads
 */

"use client";

import { useEffect, useState } from "react";
import {
  Calendar,
  AlertTriangle,
  DollarSign,
  FileText,
  Cloud,
  CheckSquare,
  Zap,
  TrendingUp,
} from "lucide-react";
import { useRouter } from "next/navigation";

interface DailySummary {
  id: string;
  summary_date: string;
  jobs_today_count: number;
  jobs_at_risk_count: number;
  overdue_payments_count: number;
  overdue_payments_amount: number;
  insurance_updates_count: number;
  weather_alerts_count: number;
  tasks_due_count: number;
  hot_leads_count: number;
  warm_leads_count: number;
  summary_data: any;
  is_read: boolean;
}

export function DailySummaryCard() {
  const router = useRouter();
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchDailySummary();
  }, []);

  const fetchDailySummary = async () => {
    try {
      const response = await fetch("/api/notifications/daily-summary");
      const data = await response.json();
      setSummary(data.data);
    } catch (error) {
      console.error("Error fetching daily summary:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading || !summary) {
    return null;
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-blue-600" />
          <h3 className="text-lg font-semibold text-gray-900">
            Daily Summary — {formatDate(summary.summary_date)}
          </h3>
        </div>
        {!summary.is_read && (
          <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
            New
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Jobs Today */}
        <div
          className="p-4 bg-blue-50 rounded-lg cursor-pointer hover:bg-blue-100 transition-colors"
          onClick={() => router.push("/jobs")}
        >
          <div className="flex items-center gap-2 mb-1">
            <Calendar className="h-4 w-4 text-blue-600" />
            <span className="text-sm font-medium text-gray-700">Jobs Today</span>
          </div>
          <div className="text-2xl font-bold text-blue-900">
            {summary.jobs_today_count}
          </div>
        </div>

        {/* Jobs at Risk */}
        {summary.jobs_at_risk_count > 0 && (
          <div
            className="p-4 bg-red-50 rounded-lg cursor-pointer hover:bg-red-100 transition-colors"
            onClick={() => router.push("/jobs?filter=at_risk")}
          >
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <span className="text-sm font-medium text-gray-700">At Risk</span>
            </div>
            <div className="text-2xl font-bold text-red-900">
              {summary.jobs_at_risk_count}
            </div>
          </div>
        )}

        {/* Overdue Payments */}
        {summary.overdue_payments_count > 0 && (
          <div
            className="p-4 bg-yellow-50 rounded-lg cursor-pointer hover:bg-yellow-100 transition-colors"
            onClick={() => router.push("/jobs?filter=payment_overdue")}
          >
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-4 w-4 text-yellow-600" />
              <span className="text-sm font-medium text-gray-700">
                Overdue Payments
              </span>
            </div>
            <div className="text-2xl font-bold text-yellow-900">
              ${summary.overdue_payments_amount.toLocaleString()}
            </div>
            <div className="text-xs text-gray-600 mt-1">
              {summary.overdue_payments_count} payment
              {summary.overdue_payments_count !== 1 ? "s" : ""}
            </div>
          </div>
        )}

        {/* Insurance Updates */}
        {summary.insurance_updates_count > 0 && (
          <div
            className="p-4 bg-purple-50 rounded-lg cursor-pointer hover:bg-purple-100 transition-colors"
            onClick={() => router.push("/inbox/replies?filter=insurance")}
          >
            <div className="flex items-center gap-2 mb-1">
              <FileText className="h-4 w-4 text-purple-600" />
              <span className="text-sm font-medium text-gray-700">
                Insurance Updates
              </span>
            </div>
            <div className="text-2xl font-bold text-purple-900">
              {summary.insurance_updates_count}
            </div>
          </div>
        )}

        {/* Weather Alerts */}
        {summary.weather_alerts_count > 0 && (
          <div
            className="p-4 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
            onClick={() => router.push("/jobs?filter=weather_alert")}
          >
            <div className="flex items-center gap-2 mb-1">
              <Cloud className="h-4 w-4 text-gray-600" />
              <span className="text-sm font-medium text-gray-700">
                Weather Alerts
              </span>
            </div>
            <div className="text-2xl font-bold text-gray-900">
              {summary.weather_alerts_count}
            </div>
          </div>
        )}

        {/* Tasks Due */}
        {summary.tasks_due_count > 0 && (
          <div
            className="p-4 bg-green-50 rounded-lg cursor-pointer hover:bg-green-100 transition-colors"
            onClick={() => router.push("/tasks?filter=due_today")}
          >
            <div className="flex items-center gap-2 mb-1">
              <CheckSquare className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium text-gray-700">
                Tasks Due
              </span>
            </div>
            <div className="text-2xl font-bold text-green-900">
              {summary.tasks_due_count}
            </div>
          </div>
        )}

        {/* Hot Leads */}
        {summary.hot_leads_count > 0 && (
          <div
            className="p-4 bg-orange-50 rounded-lg cursor-pointer hover:bg-orange-100 transition-colors"
            onClick={() => router.push("/leads?filter=hot")}
          >
            <div className="flex items-center gap-2 mb-1">
              <Zap className="h-4 w-4 text-orange-600" />
              <span className="text-sm font-medium text-gray-700">
                Hot Leads
              </span>
            </div>
            <div className="text-2xl font-bold text-orange-900">
              {summary.hot_leads_count}
            </div>
          </div>
        )}

        {/* Warm Leads */}
        {summary.warm_leads_count > 0 && (
          <div
            className="p-4 bg-blue-50 rounded-lg cursor-pointer hover:bg-blue-100 transition-colors"
            onClick={() => router.push("/leads?filter=warm")}
          >
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium text-gray-700">
                Warm Leads
              </span>
            </div>
            <div className="text-2xl font-bold text-blue-900">
              {summary.warm_leads_count}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}






































