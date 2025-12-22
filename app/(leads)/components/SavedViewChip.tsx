"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronsUpDown } from "lucide-react";

export type SavedView = {
  id: string;
  name: string;
  description?: string | null;
  visibility?: "private" | "team" | "system";
  scope?: "account" | "campaign";
  campaignId?: string | null;
  filters?: unknown;
  smart?: boolean;
  last_refreshed?: string | null;
  llm_prompt?: string | null;
};

export function SavedViewChip({
  views,
  value,
  onChange,
}: {
  views: SavedView[];
  value?: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const active = value ? views.find((v) => v.id === value) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="flex items-center gap-1 cursor-pointer">
          <Badge variant="secondary" className="cursor-pointer gap-1">
            {active ? active.name : "All Leads"}
            <ChevronsUpDown className="h-3 w-3 opacity-60" />
          </Badge>
          {active && (
            <>
              {active.smart && (
                <Badge variant="outline" className="ml-1">
                  🤖 SmartList
                </Badge>
              )}
              <Badge variant="outline" className="ml-1">
                {active.visibility ?? "private"}
              </Badge>
              {active.scope === "campaign" && (
                <Badge variant="outline" className="ml-1">
                  campaign
                </Badge>
              )}
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-1">
        <div className="flex flex-col">
          <button
            type="button"
            className="rounded px-2 py-1.5 text-left hover:bg-muted"
            onClick={() => {
              onChange("");
              setOpen(false);
            }}
          >
            All Leads
          </button>
          {views.map((view) => (
            <button
              key={view.id}
              type="button"
              className="rounded px-2 py-1.5 text-left hover:bg-muted flex items-center gap-2"
              onClick={() => {
                onChange(view.id);
                setOpen(false);
              }}
              title={view.description ?? undefined}
            >
              {view.smart && <span>🤖</span>}
              <span>{view.name}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

