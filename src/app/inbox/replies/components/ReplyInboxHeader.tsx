"use client";

import type { ReplyInboxFilters } from "@/types/reply-inbox";

interface ReplyInboxHeaderProps {
  filters: ReplyInboxFilters;
  onFiltersChange: (filters: ReplyInboxFilters) => void;
}

export default function ReplyInboxHeader({
  filters,
  onFiltersChange,
}: ReplyInboxHeaderProps) {
  return (
    <div className="border-b bg-background px-6 py-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reply Inbox</h1>
          <p className="text-sm text-muted-foreground">
            All replies from homeowners across every campaign.
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          <select
            value={filters.scope || "mine"}
            onChange={(e) =>
              onFiltersChange({ ...filters, scope: e.target.value as "mine" | "all" })
            }
            className="rounded-md border px-3 py-2 text-sm"
          >
            <option value="mine">My replies</option>
            <option value="all">All replies</option>
          </select>
        </div>
      </div>
    </div>
  );
}





























































