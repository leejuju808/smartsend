"use client";

import { Button } from "@/components/ui/button";
import * as React from "react";
import type { ThreadLabel } from "./LabelBadge";

export const ALL_LABELS: Exclude<ThreadLabel, null>[] = [
  "human_reply",
  "out_of_office",
  "question",
  "positive",
  "neutral",
  "routing",
  "bounce",
];

export function FiltersBar({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const toggle = React.useCallback(
    (key: string) => {
      const set = new Set(value);
      set.has(key) ? set.delete(key) : set.add(key);
      onChange(Array.from(set));
    },
    [onChange, value]
  );

  const clear = React.useCallback(() => onChange([]), [onChange]);
  const all = React.useCallback(() => onChange([...ALL_LABELS]), [onChange]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {ALL_LABELS.map((key) => {
        const active = value.includes(key);
        return (
          <Button
            key={key}
            size="sm"
            variant={active ? "default" : "outline"}
            onClick={() => toggle(key)}
            className="capitalize"
          >
            {key.replaceAll("_", " ")}
          </Button>
        );
      })}

      <div className="ml-auto flex gap-2">
        <Button size="sm" variant="outline" onClick={clear}>
          Clear
        </Button>
        <Button size="sm" onClick={all}>
          All
        </Button>
      </div>
    </div>
  );
}

