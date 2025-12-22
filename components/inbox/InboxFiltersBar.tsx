"use client";

import { InboxFilters, InboxCategoryFilter, TimeRange } from "@/lib/hooks/useInboxSearch";
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
import { MailQuestion, Filter, X } from "lucide-react";

type CampaignOption = {
  id: string;
  name: string;
};

type Props = {
  filters: InboxFilters;
  onChange: (patch: Partial<InboxFilters>) => void;
  onRefresh: () => void;
  campaigns?: CampaignOption[];
};

export function InboxFiltersBar({
  filters,
  onChange,
  onRefresh,
  campaigns = [],
}: Props) {
  const categoryOptions: { value: InboxCategoryFilter; label: string }[] = [
    { value: "", label: "All categories" },
    { value: "interested", label: "Interested" },
    { value: "neutral", label: "Neutral" },
    { value: "not_interested", label: "Not interested" },
    { value: "out_of_office", label: "Out of office" },
    { value: "bounce", label: "Bounce" },
    { value: "forwarded", label: "Forwarded" },
    { value: "not_a_lead", label: "Not a lead" },
    { value: "unlabeled", label: "Unlabeled" },
  ];

  const rangeOptions: { value: TimeRange; label: string }[] = [
    { value: "24h", label: "Last 24h" },
    { value: "7d", label: "Last 7 days" },
    { value: "30d", label: "Last 30 days" },
  ];

  const hasActiveFilters =
    !!filters.q ||
    !!filters.category ||
    !!filters.campaignId ||
    filters.hasMeeting ||
    filters.range !== "7d";

  const resetFilters = () => {
    onChange({
      q: "",
      category: "",
      campaignId: "",
      hasMeeting: false,
      range: "7d",
    });
  };

  return (
    <div className="flex flex-col gap-3 border rounded-md bg-slate-950/70 p-3 text-xs">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Filter className="h-3 w-3" />
          <span className="text-[11px] font-semibold">
            Inbox filters
          </span>
          {hasActiveFilters && (
            <span className="text-[10px] text-emerald-400">
              Active
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasActiveFilters && (
            <Button
              size="xs"
              variant="ghost"
              className="h-7 px-2 text-[11px] flex items-center gap-1"
              onClick={resetFilters}
            >
              <X className="h-3 w-3" />
              Clear
            </Button>
          )}
          <Button
            size="xs"
            variant="outline"
            className="h-7 px-2 text-[11px] flex items-center gap-1"
            onClick={onRefresh}
          >
            <MailQuestion className="h-3 w-3" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        {/* Search */}
        <div className="flex-1 min-w-[200px]">
          <Input
            className="h-8 text-xs"
            placeholder="Search by email, subject, or body…"
            value={filters.q}
            onChange={(e) => onChange({ q: e.target.value })}
          />
        </div>

        {/* Category */}
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-muted-foreground">
            Category
          </span>
          <Select
            value={filters.category}
            onValueChange={(v) =>
              onChange({ category: v as InboxCategoryFilter })
            }
          >
            <SelectTrigger className="h-8 w-40 text-xs">
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              {categoryOptions.map((opt) => (
                <SelectItem key={opt.value || "all"} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Campaign */}
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-muted-foreground">
            Campaign
          </span>
          <Select
            value={filters.campaignId}
            onValueChange={(v) => onChange({ campaignId: v })}
          >
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue placeholder="All campaigns" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All campaigns</SelectItem>
              {campaigns.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Range */}
        <div className="flex items-center gap-1">
          <span className="text-[11px] text-muted-foreground">
            Range
          </span>
          <Select
            value={filters.range}
            onValueChange={(v) => onChange({ range: v as TimeRange })}
          >
            <SelectTrigger className="h-8 w-32 text-xs">
              <SelectValue placeholder="Last 7 days" />
            </SelectTrigger>
            <SelectContent>
              {rangeOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Meeting intent */}
        <div className="flex items-center gap-2">
          <Switch
            checked={filters.hasMeeting}
            onCheckedChange={(checked) =>
              onChange({ hasMeeting: checked })
            }
          />
          <span className="text-[11px] text-muted-foreground">
            Meeting-intent only
          </span>
        </div>
      </div>
    </div>
  );
}

