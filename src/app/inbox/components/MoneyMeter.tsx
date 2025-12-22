"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, TrendingUp, CheckCircle, Briefcase, Shield } from "lucide-react";
import { colors } from "../constants/colors";

interface MoneyMeterMetrics {
  bookedRevenue: number; // Last 30 days
  pipelineValue: number; // Projected: sum of estimated_value × probability
  jobsBooked: number; // Count of booked estimates logged through Inbox
  activeJobsInConversation?: number; // Active opportunities (booked + pending)
  cushionDays?: number; // pipelineValue / daily run-rate
}

interface MoneyCardProps {
  value: string;
  label: string;
  icon: React.ReactNode;
  color: string;
}

function MoneyCard({ value, label, icon, color }: MoneyCardProps) {
  return (
    <div
      className="rounded-lg p-4 transition-all hover:shadow-md"
      style={{
        backgroundColor: colors.white,
        border: `1px solid ${colors.divider}`,
        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <div
          className="p-2 rounded-lg"
          style={{ backgroundColor: color + "20", color }}
        >
          {icon}
        </div>
        <div
          className="text-2xl font-bold"
          style={{ color }}
        >
          {value}
        </div>
      </div>
      <div
        className="text-xs font-medium"
        style={{ color: colors.inkSecondary }}
      >
        {label}
      </div>
    </div>
  );
}

export function MoneyMeter() {
  const [metrics, setMetrics] = useState<MoneyMeterMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchMetrics() {
      try {
        const response = await fetch("/api/inbox/owner/money-metrics");
        if (response.ok) {
          const data = await response.json();
          setMetrics(data);
        }
      } catch (error) {
        console.error("Error fetching money metrics:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchMetrics();
    // Refresh metrics every 30 seconds
    const interval = setInterval(fetchMetrics, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex gap-3 px-6 py-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-40 rounded-lg" />
        ))}
      </div>
    );
  }

  if (!metrics) {
    return null;
  }

  const formatCurrency = (value: number) => {
    if (value >= 1000) {
      return `$${(value / 1000).toFixed(1)}k`;
    }
    return `$${value.toLocaleString()}`;
  };

  return (
    <div className="px-6 py-4 border-b" style={{ borderColor: colors.divider, backgroundColor: colors.white }}>
      <div className="mb-3">
        <h2 className="text-lg font-semibold" style={{ color: colors.ink }}>
          SmartSend Price Power Meter
        </h2>
        <p className="text-xs" style={{ color: colors.inkSecondary }}>
          Cushion = calm selling. Calm selling = higher prices.
        </p>
      </div>
      <div className="flex gap-3 flex-wrap">
        <MoneyCard
          value={(metrics.activeJobsInConversation ?? 0).toString()}
          label="Active Jobs in Conversation"
          icon={<Briefcase className="h-5 w-5" />}
          color={colors.ink}
        />
        <MoneyCard
          value={`+${formatCurrency(metrics.bookedRevenue)}`}
          label="Booked Revenue (Last 30 Days)"
          icon={<DollarSign className="h-5 w-5" />}
          color={colors.success}
        />
        <MoneyCard
          value={formatCurrency(metrics.pipelineValue)}
          label="Estimated Value in Play (Projected)"
          icon={<TrendingUp className="h-5 w-5" />}
          color={colors.primary}
        />
        <MoneyCard
          value={`${metrics.cushionDays ?? 0}d`}
          label="Visible Cushion (Days)"
          icon={<Shield className="h-5 w-5" />}
          color={colors.intent.warm}
        />
        <MoneyCard
          value={metrics.jobsBooked.toString()}
          label="Jobs Booked via Inbox"
          icon={<CheckCircle className="h-5 w-5" />}
          color={colors.intent.hot}
        />
      </div>
    </div>
  );
}



















































