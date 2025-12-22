// Block 8850 — Top Leads Today Widget
// Shows 5 highest-scoring leads created today

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type TopLead = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  score: number;
  created_at: string;
};

export function TopLeadsTodayWidget() {
  const [leads, setLeads] = useState<TopLead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/leads/top-today");
        if (res.ok) {
          const json = await res.json();
          setLeads(json.leads || []);
        } else {
          console.error("Failed to load top leads");
        }
      } catch (err) {
        console.error("Failed to load top leads:", err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  if (loading) {
    return (
      <div className="rounded-xl border border-neutral-800 bg-neutral-950/95 p-4">
        <h3 className="font-semibold mb-3 text-neutral-100">Top Leads Today</h3>
        <div className="text-sm text-neutral-400">Loading…</div>
      </div>
    );
  }

  if (leads.length === 0) {
    return (
      <div className="rounded-xl border border-neutral-800 bg-neutral-950/95 p-4">
        <h3 className="font-semibold mb-3 text-neutral-100">Top Leads Today</h3>
        <div className="text-sm text-neutral-400">No leads created today yet</div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-950/95 p-4">
      <h3 className="font-semibold mb-3 text-neutral-100">Top Leads Today</h3>
      <div className="space-y-2">
        {leads.map((lead) => {
          const name =
            lead.first_name || lead.last_name
              ? `${lead.first_name || ""} ${lead.last_name || ""}`.trim()
              : lead.email;

          const scoreColor =
            lead.score >= 80
              ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
              : lead.score >= 40
              ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
              : "bg-neutral-800 text-neutral-100 border-neutral-700";

          return (
            <div
              key={lead.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-neutral-800 bg-neutral-900/50 p-3 hover:bg-neutral-900 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <div className="text-sm font-medium text-neutral-100 truncate">
                    {name}
                  </div>
                  <div
                    className={`rounded-xl px-2 py-0.5 text-xs font-semibold border ${scoreColor}`}
                  >
                    {lead.score}
                  </div>
                </div>
                {lead.company && (
                  <div className="text-xs text-neutral-400 truncate">
                    {lead.company}
                  </div>
                )}
                <div className="text-xs text-neutral-500 mt-1">
                  {lead.email}
                </div>
              </div>
              <Link
                href={`/leads/${lead.id}`}
                className="rounded-lg bg-neutral-800 px-3 py-1.5 text-xs text-neutral-300 hover:text-neutral-50 hover:bg-neutral-700 transition-colors whitespace-nowrap"
              >
                Open Lead
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}

