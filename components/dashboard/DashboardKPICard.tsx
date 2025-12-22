"use client";

import Link from "next/link";
import { ArrowUpRight, ArrowDownRight, TrendingUp, Calendar, DollarSign, MessageSquare, Zap, CheckSquare } from "lucide-react";

interface KPICardProps {
  title: string;
  value: string | number;
  delta?: number;
  deltaLabel?: string;
  icon: React.ReactNode;
  href?: string;
  color?: "blue" | "orange" | "green" | "purple" | "red";
  onClick?: () => void;
}

export function DashboardKPICard({
  title,
  value,
  delta,
  deltaLabel,
  icon,
  href,
  color = "blue",
  onClick,
}: KPICardProps) {
  const colorClasses = {
    blue: "bg-blue-50 border-blue-200 text-blue-700",
    orange: "bg-orange-50 border-orange-200 text-orange-700",
    green: "bg-green-50 border-green-200 text-green-700",
    purple: "bg-purple-50 border-purple-200 text-purple-700",
    red: "bg-red-50 border-red-200 text-red-700",
  };

  const iconColorClasses = {
    blue: "text-blue-600",
    orange: "text-orange-600",
    green: "text-green-600",
    purple: "text-purple-600",
    red: "text-red-600",
  };

  const content = (
    <div
      className={`rounded-lg border-2 p-6 transition-all hover:shadow-md ${
        href || onClick ? "cursor-pointer" : ""
      } ${colorClasses[color]}`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium opacity-80 mb-1">{title}</p>
          <p className="text-3xl font-bold mb-2">{value}</p>
          {delta !== undefined && (
            <div className="flex items-center gap-1 text-sm">
              {delta >= 0 ? (
                <ArrowUpRight className="h-4 w-4" />
              ) : (
                <ArrowDownRight className="h-4 w-4" />
              )}
              <span className={delta >= 0 ? "text-green-700" : "text-red-700"}>
                {delta >= 0 ? "+" : ""}{delta} {deltaLabel || ""}
              </span>
            </div>
          )}
        </div>
        <div className={`p-3 rounded-lg bg-white ${iconColorClasses[color]}`}>
          {icon}
        </div>
      </div>
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return content;
}

// Specific KPI Card Components
export function RepliesTodayCard({ count, delta }: { count: number; delta: number }) {
  return (
    <DashboardKPICard
      title="Replies Today"
      value={count}
      delta={delta}
      deltaLabel="vs yesterday"
      icon={<MessageSquare className="h-6 w-6" />}
      color="blue"
      href="/inbox"
    />
  );
}

export function HotLeadsCard({ count, delta }: { count: number; delta: number }) {
  return (
    <DashboardKPICard
      title="🔥 HOT Leads"
      value={count}
      delta={delta}
      deltaLabel="vs yesterday"
      icon={<Zap className="h-6 w-6" />}
      color="orange"
      href="/pipeline?status=hot"
    />
  );
}

export function TasksDueCard({ count, overdue }: { count: number; overdue: number }) {
  return (
    <DashboardKPICard
      title="Tasks Due Today"
      value={count}
      delta={overdue}
      deltaLabel={overdue > 0 ? "overdue 🔴" : undefined}
      icon={<CheckSquare className="h-6 w-6" />}
      color={overdue > 0 ? "red" : "purple"}
      href="/tasks"
    />
  );
}

export function EstimatedRevenueCard({ total, delta }: { total: number; delta: number }) {
  const formattedTotal = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(total);

  const formattedDelta = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.abs(delta));

  return (
    <DashboardKPICard
      title="💰 Estimated Revenue"
      value={formattedTotal}
      delta={delta}
      deltaLabel={`this week`}
      icon={<DollarSign className="h-6 w-6" />}
      color="green"
      href="/revenue"
    />
  );
}

export function UpcomingAppointmentsCard({ today, tomorrow }: { today: number; tomorrow: number }) {
  return (
    <DashboardKPICard
      title="Upcoming Appointments"
      value={`${today + tomorrow} scheduled`}
      delta={today}
      deltaLabel={`today + ${tomorrow} tomorrow`}
      icon={<Calendar className="h-6 w-6" />}
      color="purple"
      href="/scheduler"
    />
  );
}

export function CampaignActivityCard({
  campaignName,
  emailsSent,
  openRate,
  replies,
}: {
  campaignName: string;
  emailsSent: number;
  openRate: number;
  replies: number;
}) {
  return (
    <DashboardKPICard
      title={`Campaign: ${campaignName}`}
      value={`${emailsSent} emails sent today`}
      delta={openRate}
      deltaLabel={`Open rate: ${openRate}% | Replies: ${replies}`}
      icon={<TrendingUp className="h-6 w-6" />}
      color="blue"
      href="/campaigns"
    />
  );
}





















































