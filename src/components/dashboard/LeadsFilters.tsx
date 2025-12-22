// components/dashboard/LeadsFilters.tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition, useState } from "react";
import LoadingButton from "@/components/ui/LoadingButton";

const STATUSES = ["all","new","queued","sent","bounced","failed","retrying","replied","paused"] as const;

export default function LeadsFilters() {
  const router = useRouter();
  const sp = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [status, setStatus] = useState(sp.get("status") ?? "all");
  const [perPage, setPerPage] = useState(sp.get("perPage") ?? "20");
  const [campaignId, setCampaignId] = useState(sp.get("campaignId") ?? "");
  const [search, setSearch] = useState(sp.get("search") ?? "");

  const apply = () => {
    const params = new URLSearchParams(sp.toString());
    params.set("status", status);
    params.set("perPage", perPage);
    if (campaignId) params.set("campaignId", campaignId); else params.delete("campaignId");
    if (search) params.set("search", search); else params.delete("search");
    params.set("page", "1"); // reset to first page on new filter
    startTransition(() => router.push(`/dashboard/leads?${params.toString()}`));
  };

  // ✅ NEW: quick chip helper
  const setQuick = (kv: Record<string, string | undefined>) => {
    const params = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(kv)) {
      if (v) params.set(k, v); else params.delete(k);
    }
    params.set("page", "1");
    startTransition(() => router.push(`/dashboard/leads?${params.toString()}`));
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3 items-end bg-black text-white p-4 rounded-2xl border border-gray-800">
        <div className="flex flex-col">
          <label className="text-xs text-gray-400">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="bg-gray-900 border border-gray-700 rounded-xl px-3 py-2"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col">
          <label className="text-xs text-gray-400">Per Page</label>
          <select
            value={perPage}
            onChange={(e) => setPerPage(e.target.value)}
            className="bg-gray-900 border border-gray-700 rounded-xl px-3 py-2"
          >
            {[10,20,50,100].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>

        <div className="flex flex-col min-w-[220px]">
          <label className="text-xs text-gray-400">Campaign ID (optional)</label>
          <input
            value={campaignId}
            onChange={(e) => setCampaignId(e.target.value)}
            className="bg-gray-900 border border-gray-700 rounded-xl px-3 py-2"
            placeholder="uuid…"
          />
        </div>

        <div className="flex flex-col min-w-[220px]">
          <label className="text-xs text-gray-400">Search Email</label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-gray-900 border border-gray-700 rounded-xl px-3 py-2"
            placeholder="contains…"
          />
        </div>

        <LoadingButton
          loading={isPending}
          onClick={apply}
          className="rounded-2xl px-4 py-2 font-medium bg-yellow-400 text-black hover:bg-yellow-300"
          spinnerClassName="text-black"
        >
          {isPending ? "Applying…" : "Apply"}
        </LoadingButton>
      </div>

      {/* ✅ NEW quick chips */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setQuick({ status: "failed" })}
          className="px-3 py-1 rounded-full text-sm bg-yellow-400 text-black hover:bg-yellow-300 font-medium"
        >
          Status: failed
        </button>
        <button
          onClick={() => setQuick({ status: "queued" })}
          className="px-3 py-1 rounded-full text-sm bg-gray-800 text-gray-200 hover:bg-gray-700"
        >
          Status: queued
        </button>
        <button
          onClick={() => setQuick({ status: "replied" })}
          className="px-3 py-1 rounded-full text-sm bg-gray-800 text-gray-200 hover:bg-gray-700"
        >
          Status: replied
        </button>
        <button
          onClick={() => setQuick({ status: "all" })}
          className="px-3 py-1 rounded-full text-sm bg-gray-800 text-gray-200 hover:bg-gray-700"
        >
          Clear filters
        </button>
      </div>
    </div>
  );
}