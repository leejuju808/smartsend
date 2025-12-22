"use client";

import { Dispatch, SetStateAction } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/src/components/ui/switch";
import { Label } from "@/components/ui/label";

export type InboxFilterState = {
  category: string; // "all" | "positive" | "negative" | "neutral" | "oop" | "spam"
  hasMeetingOnly: boolean;
  stopFollowupsOnly: boolean;
  search: string;
  dateRange?: "all" | "7d" | "30d" | "90d";
};

type Props = {
  filters: InboxFilterState;
  setFilters: Dispatch<SetStateAction<InboxFilterState>>;
};

export function InboxFilters({ filters, setFilters }: Props) {
  const update = (patch: Partial<InboxFilterState>) => {
    setFilters((prev) => ({ ...prev, ...patch }));
  };

  return (
    <div className="flex flex-col md:flex-row gap-3 items-start md:items-center justify-between text-xs">
      <div className="flex flex-wrap items-center gap-2">
        {/* Category select */}
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-muted-foreground">Reply type</span>
          <Select
            value={filters.category}
            onValueChange={(val) => update({ category: val })}
          >
            <SelectTrigger className="h-7 px-2 text-[11px] w-36 bg-slate-950 border-slate-800">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="text-[11px]">
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="positive">Interested</SelectItem>
              <SelectItem value="negative">Not interested</SelectItem>
              <SelectItem value="neutral">Neutral</SelectItem>
              <SelectItem value="oop">Out of office</SelectItem>
              <SelectItem value="spam">Spam</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Meeting intent switch */}
        <div className="flex items-center gap-1">
          <Switch
            id="meeting-only"
            checked={filters.hasMeetingOnly}
            onCheckedChange={(checked) => update({ hasMeetingOnly: checked })}
          />
          <Label htmlFor="meeting-only" className="text-[11px]">
            Has meeting intent
          </Label>
        </div>

        {/* Stop followups switch */}
        <div className="flex items-center gap-1">
          <Switch
            id="stop-only"
            checked={filters.stopFollowupsOnly}
            onCheckedChange={(checked) =>
              update({ stopFollowupsOnly: checked })
            }
          />
          <Label htmlFor="stop-only" className="text-[11px]">
            Stop followups
          </Label>
        </div>
      </div>

      {/* Search box */}
      <div className="flex items-center gap-2 w-full md:w-auto">
        <Input
          value={filters.search}
          onChange={(e) => update({ search: e.target.value })}
          placeholder="Search by subject or email…"
          className="h-7 text-[11px] bg-slate-950 border-slate-800"
        />
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-[11px]"
          onClick={() =>
            setFilters({
              category: "all",
              hasMeetingOnly: false,
              stopFollowupsOnly: false,
              search: "",
            })
          }
        >
          Reset
        </Button>
      </div>
    </div>
  );
}
