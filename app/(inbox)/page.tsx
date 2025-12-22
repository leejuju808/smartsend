"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import InboxFilters from "./InboxFilters";
import { FilterBar, FilterState } from "@/components/search/FilterBar";

const InboxList = dynamic(() => import("./InboxList"), { ssr: false });

export default function InboxPage() {
  const [filters, setFilters] = useState<FilterState>({});

  return (
    <div className="space-y-4">
      <InboxFilters />
      <FilterBar
        filters={filters}
        onFiltersChange={setFilters}
        showStatus={true}
        showTags={true}
        showTime={true}
        showCampaign={true}
        showList={false}
      />
      <InboxList />
    </div>
  );
}
