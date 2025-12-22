// components/segments/SegmentHeader.tsx

"use client";

import { useSegmentPreview } from "@/lib/hooks/useSegmentPreview";
import type { SegmentRuleNode } from "@/lib/segments/debug";
import type { SegmentCondition } from "@/lib/segments/schema";

interface SegmentHeaderProps {
  accountId: string;
  rules?: SegmentRuleNode | null;
  conditions?: SegmentCondition[]; // Alternative: flat conditions array
  title?: string;
}

/**
 * Convert flat SegmentCondition[] to SegmentRuleNode tree structure
 */
function conditionsToRules(conditions: SegmentCondition[]): SegmentRuleNode | null {
  if (!conditions || conditions.length === 0) {
    return null;
  }

  // Map operators from schema to ComparisonOp
  const opMap: Record<string, string> = {
    "=": "eq",
    "!=": "neq",
    "contains": "contains",
    ">": "gt",
    "<": "lt",
  };

  const segmentConditions = conditions.map((cond, idx) => ({
    type: "condition" as const,
    id: `cond-${idx}`,
    field: cond.field,
    op: (opMap[cond.op] || cond.op) as any,
    value: cond.value,
  }));

  if (segmentConditions.length === 1) {
    return segmentConditions[0];
  }

  return {
    type: "group",
    id: "root",
    mode: "AND",
    children: segmentConditions,
  };
}

export function SegmentHeader({
  accountId,
  rules,
  conditions,
  title = "Segment",
}: SegmentHeaderProps) {
  // Convert conditions to rules if provided
  const normalizedRules = rules ?? (conditions ? conditionsToRules(conditions) : null);

  const { count, loading } = useSegmentPreview(accountId, normalizedRules);

  return (
    <div className="flex items-center justify-between pr-4">
      <h1 className="font-semibold text-xl">{title}</h1>

      <div className="flex items-center gap-3">
        {loading ? (
          <span className="text-xs text-muted-foreground">calculating…</span>
        ) : (
          <span className="text-xs bg-secondary px-2 py-1 rounded-md">
            {count ?? 0} leads match
          </span>
        )}
      </div>
    </div>
  );
}

