// app/(dashboard)/leads/follow-up/FollowUpLeadList.tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type FollowUpLead = {
  lead_id: string;
  lead_name: string | null;
  lead_email: string | null;
  lead_phone: string | null;
  status: string;
  next_follow_up_at: string | null;
  last_contacted_at: string | null;
};

export function FollowUpLeadList() {
  const [leads, setLeads] = useState<FollowUpLead[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchFollowUps() {
    try {
      const res = await fetch("/api/leads/follow-up?limit=100", {
        method: "GET",
        cache: "no-store",
      });

      if (!res.ok) throw new Error("Failed to fetch follow-up leads");

      const data: FollowUpLead[] = await res.json();
      setLeads(data);
    } catch (err) {
      console.error("Error loading follow-up leads:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchFollowUps();
    const interval = setInterval(fetchFollowUps, 10_000); // refresh every 10s
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-sm text-neutral-400">
        Loading follow-up queue…
      </div>
    );
  }

  if (!leads.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-sm text-neutral-400">
        <div>No follow-ups due right now.</div>
        <div className="text-xs text-neutral-500">
          When leads are scheduled for follow-up, they will appear here.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {leads.map((lead) => (
        <div
          key={lead.lead_id}
          className="flex items-center justify-between gap-4 rounded-2xl border border-neutral-800 bg-neutral-950/80 px-4 py-3"
        >
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-neutral-50">
                {lead.lead_name || "Unnamed Lead"}
              </span>
              <span className="rounded-full border border-neutral-700 px-2 py-0.5 text-[0.65rem] uppercase tracking-wide text-neutral-300">
                {lead.status}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-400">
              {lead.lead_email && <span>{lead.lead_email}</span>}
              {lead.lead_phone && <span>• {lead.lead_phone}</span>}
              {lead.next_follow_up_at && (
                <span>
                  • Due:{" "}
                  {new Date(lead.next_follow_up_at).toLocaleString()}
                </span>
              )}
              {lead.last_contacted_at && (
                <span>
                  • Last contacted:{" "}
                  {new Date(lead.last_contacted_at).toLocaleString()}
                </span>
              )}
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

























































