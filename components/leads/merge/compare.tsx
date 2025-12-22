"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";

type Lead = {
  id?: string;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  company?: string | null;
  phone?: string | null;
  title?: string | null;
  linkedin?: string | null;
  website?: string | null;
  custom?: Record<string, unknown> | null;
  [key: string]: unknown;
};

type MergeCompareProps = {
  a: Lead | null;
  b: Lead | null;
  onMerge: (selectedFields: Record<string, unknown>) => void;
};

// Fields to display in the merge comparison
const MERGEABLE_FIELDS = [
  { key: "email", label: "Email" },
  { key: "first_name", label: "First Name" },
  { key: "last_name", label: "Last Name" },
  { key: "company", label: "Company" },
  { key: "phone", label: "Phone" },
  { key: "title", label: "Title" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "website", label: "Website" },
] as const;

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function MergeCompare({ a, b, onMerge }: MergeCompareProps) {
  const [selected, setSelected] = useState<Record<string, unknown>>({});

  if (!a || !b) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Loading leads...
      </div>
    );
  }

  function choose(field: string, value: unknown) {
    setSelected((prev) => ({ ...prev, [field]: value }));
  }

  // Initialize selected fields with winner defaults (prefer non-null values)
  const getDefaultValue = (field: string, leadA: Lead, leadB: Lead): unknown => {
    const aVal = leadA[field];
    const bVal = leadB[field];
    // Prefer non-null, non-empty values
    if (aVal && String(aVal).trim()) return aVal;
    if (bVal && String(bVal).trim()) return bVal;
    return aVal ?? bVal ?? null;
  };

  // Initialize selections on mount
  useEffect(() => {
    if (!a || !b) return;
    const initial: Record<string, unknown> = {};
    MERGEABLE_FIELDS.forEach(({ key }) => {
      initial[key] = getDefaultValue(key, a, b);
    });
    setSelected(initial);
  }, [a, b]);

  const handleMerge = () => {
    // Ensure all fields have selections
    const finalSelected: Record<string, unknown> = { ...selected };
    MERGEABLE_FIELDS.forEach(({ key }) => {
      if (!(key in finalSelected)) {
        finalSelected[key] = getDefaultValue(key, a, b);
      }
    });
    onMerge(finalSelected);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        {/* Lead A Column */}
        <div className="space-y-2">
          <h3 className="font-bold mb-3 text-lg">Lead A</h3>
          {MERGEABLE_FIELDS.map(({ key, label }) => {
            const value = a[key];
            const isSelected = selected[key] === value;
            return (
              <div key={key} className="mb-2">
                <div className="text-xs text-muted-foreground mb-1">{label}</div>
                <Button
                  variant={isSelected ? "default" : "outline"}
                  className="w-full text-left justify-start h-auto py-2 px-3"
                  onClick={() => choose(key, value)}
                >
                  <span className="truncate block">
                    {formatValue(value) || <span className="text-muted-foreground">(empty)</span>}
                  </span>
                </Button>
              </div>
            );
          })}
        </div>

        {/* Center Column - Choose indicator */}
        <div className="flex items-center justify-center">
          <p className="font-semibold text-muted-foreground text-sm">Choose</p>
        </div>

        {/* Lead B Column */}
        <div className="space-y-2">
          <h3 className="font-bold mb-3 text-lg">Lead B</h3>
          {MERGEABLE_FIELDS.map(({ key, label }) => {
            const value = b[key];
            const isSelected = selected[key] === value;
            return (
              <div key={key} className="mb-2">
                <div className="text-xs text-muted-foreground mb-1">{label}</div>
                <Button
                  variant={isSelected ? "default" : "outline"}
                  className="w-full text-left justify-start h-auto py-2 px-3"
                  onClick={() => choose(key, value)}
                >
                  <span className="truncate block">
                    {formatValue(value) || <span className="text-muted-foreground">(empty)</span>}
                  </span>
                </Button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Merge Button */}
      <div className="col-span-3 mt-6 text-center border-t pt-6">
        <Button onClick={handleMerge} size="lg">
          Merge Leads
        </Button>
        <p className="text-xs text-muted-foreground mt-2">
          Lead A will be kept. Lead B will be deleted after merging.
        </p>
      </div>
    </div>
  );
}

