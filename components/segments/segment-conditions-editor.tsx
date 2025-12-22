"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, Plus } from "lucide-react";
import type { SegmentCondition } from "@/lib/segments/schema";

interface SegmentConditionsEditorProps {
  value: SegmentCondition[];
  onChange: (next: SegmentCondition[]) => void;
}

const FIELD_OPTIONS = [
  { value: "email", label: "Email" },
  { value: "company", label: "Company" },
  { value: "title", label: "Job Title" },
  { value: "city", label: "City" },
  { value: "country", label: "Country" },
  { value: "tags", label: "Tags (text search)" },
  // Company-level fields
  { value: "company.industry", label: "Company Industry" },
  { value: "company.size", label: "Company Size" },
  { value: "company.domain", label: "Company Domain" },
  { value: "company.tech_stack", label: "Tech Stack Contains" },
  { value: "company.engagement_score", label: "Engagement Score" },
];

const OP_OPTIONS: SegmentCondition["op"][] = ["=", "!=", "contains", ">", "<", ">=", "<=", "in"];

export function SegmentConditionsEditor({
  value,
  onChange,
}: SegmentConditionsEditorProps) {
  function updateCondition(index: number, patch: Partial<SegmentCondition>) {
    const next = [...value];
    next[index] = { ...next[index], ...patch };
    onChange(next);
  }

  function addCondition() {
    onChange([
      ...value,
      {
        field: "email",
        op: "=",
        value: "",
      },
    ]);
  }

  function removeCondition(index: number) {
    const next = value.filter((_, i) => i !== index);
    onChange(next);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">Conditions (AND logic)</h3>
          <p className="text-xs text-muted-foreground">
            All conditions must be true for a lead to be included in this segment.
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={addCondition}>
          <Plus className="mr-1 h-4 w-4" />
          Add condition
        </Button>
      </div>

      {value.length === 0 && (
        <p className="rounded-md border border-dashed bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          No conditions yet. Add at least one condition to define who belongs in this segment.
        </p>
      )}

      <div className="space-y-2">
        {value.map((cond, index) => (
          <div
            key={index}
            className="grid grid-cols-[1.4fr,1fr,2fr,auto] gap-2 items-center rounded-lg border bg-card px-2 py-2"
          >
            {/* Field */}
            <Select
              value={cond.field}
              onValueChange={(val) => updateCondition(index, { field: val })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Field" />
              </SelectTrigger>
              <SelectContent>
                {FIELD_OPTIONS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Operator */}
            <Select
              value={cond.op}
              onValueChange={(val) =>
                updateCondition(index, { op: val as SegmentCondition["op"] })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Op" />
              </SelectTrigger>
              <SelectContent>
                {OP_OPTIONS.map((op) => (
                  <SelectItem key={op} value={op}>
                    {op}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Value */}
            {cond.field === "company.tech_stack" ? (
              <Input
                value={Array.isArray(cond.value) ? cond.value.join(", ") : String(cond.value ?? "")}
                onChange={(e) => {
                  const techStack = e.target.value
                    .split(",")
                    .map((v) => v.trim())
                    .filter(Boolean);
                  updateCondition(index, { value: techStack.length > 0 ? techStack : e.target.value });
                }}
                placeholder="e.g. Shopify, Klaviyo, React"
              />
            ) : (
              <Input
                value={String(cond.value ?? "")}
                onChange={(e) => updateCondition(index, { value: e.target.value })}
                placeholder={
                  cond.field === "company.engagement_score"
                    ? "e.g. 5"
                    : cond.field === "company.industry"
                    ? "e.g. Construction"
                    : cond.field === "company.size"
                    ? "e.g. 50-500"
                    : cond.field === "company.domain"
                    ? "e.g. example.com"
                    : "Value (e.g. 'SaaS', 'Founder', 'United States')"
                }
              />
            )}

            {/* Remove */}
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => removeCondition(index)}
              aria-label="Remove condition"
            >
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Example:{" "}
        <span className="font-mono">
          company contains &quot;SaaS&quot;
        </span>{" "}
        AND{" "}
        <span className="font-mono">
          title contains &quot;Founder&quot;
        </span>
        .
      </p>
    </div>
  );
}
