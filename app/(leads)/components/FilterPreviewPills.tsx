"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";

type Node = {
  field?: string;
  op?: string;
  value?: unknown;
  opGroup?: "AND" | "OR";
  nodes?: Node[];
} & Record<string, unknown>;

function toPills(n: Node | undefined | null, acc: string[] = []): string[] {
  if (!n) return acc;
  if (Array.isArray(n.nodes) && n.nodes.length > 0) {
    n.nodes.forEach((child) => toPills(child, acc));
    return acc;
  }

  const { field, op, value } = n;
  if (!field) return acc;

  const label = (() => {
    const v = Array.isArray(value) ? value.join(", ") : String(value ?? "");
    switch (op) {
      case "eq":
        return `${field}: ${v}`;
      case "neq":
        return `${field} ≠ ${v}`;
      case "gt":
        return `${field} > ${v}`;
      case "gte":
        return `${field} ≥ ${v}`;
      case "lt":
        return `${field} < ${v}`;
      case "lte":
        return `${field} ≤ ${v}`;
      case "ilike":
        return `${field} ~ ${v}`;
      case "in":
        return `${field} ∈ {${v}}`;
      case "not_in":
        return `${field} ∉ {${v}}`;
      case "contains_any":
        return `${field} ⊃ any {${v}}`;
      case "contains_all":
        return `${field} ⊃ all {${v}}`;
      default:
        return `${field} ${op ?? ""} ${v}`.trim();
    }
  })();

  acc.push(label);
  return acc;
}

export function FilterPreviewPills({ filters }: { filters?: Node | null }) {
  if (!filters) return null;
  const pills = toPills(filters);
  if (!pills.length) return null;

  return (
    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
      {pills.map((pill, idx) => (
        <Badge key={idx} variant="secondary" className="rounded-full">
          {pill}
        </Badge>
      ))}
    </div>
  );
}



