"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type HotLead = {
  lead_id: string;
  lead_name: string | null;
  lead_email: string | null;
  lead_phone: string | null;
  last_hot_reply_at: string;
  hot_reply_count: number;
};

export function HotLeadList() {
  const [leads, setLeads] = useState<HotLead[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchHotLeads() {
    try {
      const res = await fetch("/api/leads/hot?limit=50", {
        method: "GET",
        cache: "no-store",
      });

      if (!res.ok) throw new Error("Failed to fetch hot leads");

      const data: HotLead[] = await res.json();
      setLeads(data);
    } catch (err) {
      console.error("Error loading hot leads:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchHotLeads();
    const interval = setInterval(fetchHotLeads, 10_000); // refresh every 10s

    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-neutral-400">
        Loading hot leads…
      </div>
    );
  }

  if (!leads.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-sm text-neutral-400">
        <div>No hot leads yet.</div>
        <div className="text-xs text-neutral-500">
          When homeowners reply with strong interest, they will show up here.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {leads.map((lead) => (
        <div
          key={lead.lead_id}
          className="flex items-center justify-between gap-4 rounded-2xl border border-amber-700/60 bg-neutral-950/70 px-4 py-3"
        >
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-neutral-50">
                {lead.lead_name || "Unnamed Lead"}
              </span>
              <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-amber-400">
                Hot Lead
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-400">
              {lead.lead_email && <span>{lead.lead_email}</span>}
              {lead.lead_phone && <span>• {lead.lead_phone}</span>}
              <span>
                • Last hot reply:{" "}
                {new Date(lead.last_hot_reply_at).toLocaleString()}
              </span>
              <span>• Hot replies: {lead.hot_reply_count}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/leads/${lead.lead_id}`}
              className="rounded-xl bg-neutral-100 px-3 py-2 text-xs font-semibold text-neutral-900 hover:bg-neutral-200 transition-colors"
            >
              Open Lead
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}

























































