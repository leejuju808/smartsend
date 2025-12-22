// Block 22465 — SmartSend Roofing Supplier Reliability Scoring v1
// Reliability Badge Component and Helpers

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface SupplierReliability {
  reliability_score?: number | null;
  total_orders?: number | null;
  on_time_rate?: number | null;
  avg_delay_days?: number | null;
}

/**
 * Get reliability label based on score
 * 90–100 → Elite Supplier
 * 70–89 → Solid Supplier
 * 0–69 → Risky Supplier
 */
export function reliabilityLabel(score: number | null | undefined): string {
  if (score === null || score === undefined) return "No Data";
  if (score >= 90) return "Elite";
  if (score >= 70) return "Solid";
  return "Risky";
}

/**
 * Get badge variant based on score
 */
export function reliabilityVariant(score: number | null | undefined): "default" | "secondary" | "destructive" | "outline" {
  if (score === null || score === undefined) return "outline";
  if (score >= 90) return "default"; // Green/success
  if (score >= 70) return "secondary"; // Yellow/warning
  return "destructive"; // Red/danger
}

/**
 * Get badge color classes for custom styling
 */
export function reliabilityColorClasses(score: number | null | undefined): string {
  if (score === null || score === undefined) {
    return "bg-zinc-500/20 text-zinc-400 border-zinc-500/30";
  }
  if (score >= 90) {
    return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
  }
  if (score >= 70) {
    return "bg-amber-500/20 text-amber-400 border-amber-500/30";
  }
  return "bg-red-500/20 text-red-400 border-red-500/30";
}

/**
 * Reliability Badge Component
 */
export function ReliabilityBadge({ supplier }: { supplier: SupplierReliability }) {
  const score = supplier.reliability_score ?? null;
  const label = reliabilityLabel(score);
  const colorClasses = reliabilityColorClasses(score);

  return (
    <Badge
      variant={reliabilityVariant(score)}
      className={cn("text-[10px] px-2 py-0.5 rounded-full border font-medium", colorClasses)}
    >
      {label}
      {score !== null && score !== undefined && ` • ${score}`}
    </Badge>
  );
}

/**
 * Reliability Stats Text Component
 * Shows key stats in small text format
 */
export function ReliabilityStats({ supplier }: { supplier: SupplierReliability }) {
  const totalOrders = supplier.total_orders ?? 0;
  const onTimeRate = supplier.on_time_rate ?? null;
  const avgDelay = supplier.avg_delay_days ?? null;

  if (totalOrders === 0) {
    return (
      <span className="text-xs text-muted-foreground">
        No order history yet
      </span>
    );
  }

  const parts: string[] = [];
  parts.push(`${totalOrders} order${totalOrders !== 1 ? "s" : ""}`);

  if (onTimeRate !== null) {
    parts.push(`${onTimeRate.toFixed(0)}% on-time`);
  }

  if (avgDelay !== null && avgDelay > 0) {
    parts.push(`${avgDelay.toFixed(1)} day${avgDelay !== 1 ? "s" : ""} avg delay`);
  }

  return (
    <span className="text-xs text-muted-foreground">
      {parts.join(" • ")}
    </span>
  );
}







































