"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { MailIcon, HotLeadIcon, BookedIcon, EstimateIcon } from "./icons/InboxIcons";
import { colors } from "../constants/colors";
import { cn } from "@/lib/utils";

interface InboxMetrics {
  repliesReceived: number;
  hotLeads: number;
  bookedEstimates: number;
  estimatedPipelineValue: number;
}

interface MetricCardProps {
  value: string | number;
  label: string;
  icon: React.ReactNode;
  color: string;
  tooltip: string;
}

function MetricCard({ value, label, icon, color, tooltip }: MetricCardProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className="relative rounded-lg p-4 cursor-help transition-all hover:shadow-md"
          style={{
            backgroundColor: colors.white,
            border: `1px solid ${colors.divider}`,
            boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
          }}
        >
          {/* Ghosted icon in corner */}
          <div
            className="absolute top-2 right-2 opacity-10"
            style={{ color }}
          >
            {icon}
          </div>
          
          {/* Content */}
          <div className="relative">
            <div
              className="text-3xl font-bold mb-1 transition-opacity duration-300"
              style={{ color }}
            >
              {value}
            </div>
            <div
              className="text-xs font-medium"
              style={{ color: colors.inkSecondary }}
            >
              {label}
            </div>
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p className="max-w-xs">{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  );
}

export function InboxMetricsBar() {
  const [metrics, setMetrics] = useState<InboxMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchMetrics() {
      try {
        const response = await fetch("/api/inbox/owner/metrics");
        if (response.ok) {
          const data = await response.json();
          setMetrics(data);
        }
      } catch (error) {
        console.error("Error fetching metrics:", error);
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
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-32 rounded-lg" />
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
    <TooltipProvider>
      <div className="flex gap-3 px-6 py-4 flex-wrap">
        <MetricCard
          value={metrics.repliesReceived}
          label="Replies (7d)"
          icon={<MailIcon size={24} />}
          color={colors.primary}
          tooltip="Total homeowner replies captured by SmartSend in the last 7 days."
        />
        
        <MetricCard
          value={metrics.hotLeads}
          label="Hot Leads (7d)"
          icon={<HotLeadIcon size={24} />}
          color={colors.intent.hot}
          tooltip='Leads marked as "hot" by AI in the last 7 days. These are ready for immediate follow-up.'
        />
        
        <MetricCard
          value={metrics.bookedEstimates}
          label="Booked (7d)"
          icon={<BookedIcon size={24} />}
          color={colors.success}
          tooltip='Estimates booked in the last 7 days. These are leads you marked as "Booked Estimate" from the inbox.'
        />
        
        <MetricCard
          value={formatCurrency(metrics.estimatedPipelineValue)}
          label="Est. Value"
          icon={<EstimateIcon size={24} />}
          color={colors.primary}
          tooltip="Total estimated pipeline value from booked estimates in the last 30 days."
        />
      </div>
    </TooltipProvider>
  );
}

