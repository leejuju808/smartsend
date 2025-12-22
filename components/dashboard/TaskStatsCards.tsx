// Block 13900 — Smart Tasks v2 Dashboard Cards
// Shows task statistics as dashboard cards

"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Phone, Cloud, Clock, TrendingUp } from "lucide-react";
import Link from "next/link";

type TaskStats = {
  hotLeadsNeedingAction: number;
  insuranceLeads: number;
  stormLeads: number;
  overdueTasks: number;
  todayTasks: number;
  tomorrowTasks: number;
  thisWeekTasks: number;
};

export function TaskStatsCards() {
  const [stats, setStats] = useState<TaskStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadStats() {
      try {
        const res = await fetch("/api/tasks/stats");
        const json = await res.json();
        setStats(json.data);
      } catch (error) {
        console.error("Error loading task stats:", error);
      } finally {
        setLoading(false);
      }
    }

    loadStats();
    // Refresh every 60 seconds
    const interval = setInterval(loadStats, 60000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white rounded-lg border p-4 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
            <div className="h-8 bg-gray-200 rounded w-1/3"></div>
          </div>
        ))}
      </div>
    );
  }

  if (!stats) return null;

  const cards = [
    {
      title: "HOT Leads Needing Action",
      value: stats.hotLeadsNeedingAction,
      icon: TrendingUp,
      color: "bg-red-50 border-red-200 text-red-700",
      iconColor: "text-red-600",
      href: "/tasks?priority=high&autoType=hot_lead,high_value",
    },
    {
      title: "Insurance Leads",
      value: stats.insuranceLeads,
      icon: Phone,
      color: "bg-blue-50 border-blue-200 text-blue-700",
      iconColor: "text-blue-600",
      href: "/tasks?autoType=insurance_keywords",
    },
    {
      title: "Storm Leads",
      value: stats.stormLeads,
      icon: Cloud,
      color: "bg-purple-50 border-purple-200 text-purple-700",
      iconColor: "text-purple-600",
      href: "/tasks?autoType=storm_risk",
    },
    {
      title: "Overdue Tasks",
      value: stats.overdueTasks,
      icon: AlertCircle,
      color: "bg-orange-50 border-orange-200 text-orange-700",
      iconColor: "text-orange-600",
      href: "/tasks?due=overdue",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <Link
            key={card.title}
            href={card.href}
            className={`${card.color} border rounded-lg p-4 hover:shadow-md transition-shadow`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium mb-1">{card.title}</p>
                <p className="text-2xl font-bold">{card.value}</p>
              </div>
              <Icon className={`h-8 w-8 ${card.iconColor} opacity-50`} />
            </div>
          </Link>
        );
      })}
    </div>
  );
}





















































