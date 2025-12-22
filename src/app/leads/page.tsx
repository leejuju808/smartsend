"use client";
import React, { useState } from "react";
import ImportLeadsModal from "@/components/leads/ImportLeadsModal";
import { LeadsTable } from "@/components/leads/LeadsTable";
import { ImportWizard } from "@/components/leads/ImportWizard";
import { ImportJobs } from "@/components/leads/ImportJobs";
import { FilterBar, FilterState } from "@/components/search/FilterBar";

export default function LeadsPage() {
  const [open, setOpen] = useState(false);
  const [filters, setFilters] = useState<FilterState>({});

  return (
    <div className="max-w-6xl mx-auto space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Leads</h1>
        <button onClick={() => setOpen(true)} className="px-4 py-2 rounded-xl bg-black text-white">Import CSV</button>
      </div>
      <FilterBar
        filters={filters}
        onFiltersChange={setFilters}
        showStatus={true}
        showTags={true}
        showTime={true}
        showCampaign={true}
        showList={false}
      />
      {open && <div className="fixed inset-0 bg-black/30 flex items-center justify-center"><ImportLeadsModal campaignId={null} onClose={() => setOpen(false)} /></div>}
      <ImportWizard />
      <ImportJobs />
      <LeadsTable />
    </div>
  );
}
