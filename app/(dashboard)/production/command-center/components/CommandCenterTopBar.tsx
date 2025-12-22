"use client";

// Block 246000 — Command Center Top Bar Summary
// Shows company status at a glance

import { Activity, AlertTriangle, Users, Truck, Cloud, AlertCircle } from "lucide-react";
import Link from "next/link";

interface Summary {
  active_jobs: number;
  jobs_at_risk: number;
  crews_working_today: number;
  deliveries_today: number;
  weather_risks: number;
  open_issues: number;
}

interface CommandCenterTopBarProps {
  summary: Summary;
}

export function CommandCenterTopBar({ summary }: CommandCenterTopBarProps) {
  const stats = [
    {
      label: "Active Jobs",
      value: summary.active_jobs || 0,
      icon: Activity,
      color: "text-blue-400",
      bgColor: "bg-blue-500/10",
    },
    {
      label: "Jobs at Risk",
      value: summary.jobs_at_risk || 0,
      icon: AlertTriangle,
      color: "text-red-400",
      bgColor: "bg-red-500/10",
      link: "#jobs-at-risk",
    },
    {
      label: "Crews Working Today",
      value: summary.crews_working_today || 0,
      icon: Users,
      color: "text-green-400",
      bgColor: "bg-green-500/10",
    },
    {
      label: "Deliveries Today",
      value: summary.deliveries_today || 0,
      icon: Truck,
      color: "text-purple-400",
      bgColor: "bg-purple-500/10",
    },
    {
      label: "Weather Risks",
      value: summary.weather_risks || 0,
      icon: Cloud,
      color: "text-yellow-400",
      bgColor: "bg-yellow-500/10",
    },
    {
      label: "Open Issues",
      value: summary.open_issues || 0,
      icon: AlertCircle,
      color: "text-orange-400",
      bgColor: "bg-orange-500/10",
    },
  ];

  return (
    <div className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm">
      <div className="px-6 py-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Production Command Center</h1>
            <p className="text-sm text-zinc-400 mt-1">
              Master Control Room for Roofing Operations
            </p>
          </div>
          <div className="text-xs text-zinc-500">
            Last updated: {new Date().toLocaleTimeString()}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {stats.map((stat) => {
            const Icon = stat.icon;
            const content = (
              <div
                className={`${stat.bgColor} rounded-lg p-3 border border-zinc-800 hover:border-zinc-700 transition-colors`}
              >
                <div className="flex items-center justify-between mb-2">
                  <Icon className={`h-5 w-5 ${stat.color}`} />
                  {stat.value > 0 && stat.link && (
                    <span className="text-xs text-zinc-400">Tap to view</span>
                  )}
                </div>
                <div className="text-2xl font-bold text-white">{stat.value}</div>
                <div className="text-xs text-zinc-400 mt-1">{stat.label}</div>
              </div>
            );

            if (stat.link && stat.value > 0) {
              return (
                <Link key={stat.label} href={stat.link}>
                  {content}
                </Link>
              );
            }

            return <div key={stat.label}>{content}</div>;
          })}
        </div>
      </div>
    </div>
  );
}

























