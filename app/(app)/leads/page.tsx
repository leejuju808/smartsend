"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { UpgradeModal } from "@/components/UpgradeModal";
import { LeadHeatScore } from "@/components/lead/LeadHeatScore";

type Lead = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  city: string | null;
  lead_status: string | null;
  est_job_value: number | null;
  owner_user_id: string | null;
  last_reply_at: string | null;
  last_reply_snippet: string | null;
  latest_intent_label: string | null;
  latest_intent_at: string | null;
};

type TopLead = {
  id: string;
  name: string;
  email: string;
  city: string;
  heat_score: number;
  status: string | null;
};

export default function LeadQueuePage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [topLeads, setTopLeads] = useState<TopLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingTopLeads, setLoadingTopLeads] = useState(true);
  const [status, setStatus] = useState<"all" | "hot" | "warm" | "follow_up">(
    "all"
  );
  const [owner, setOwner] = useState<"all" | "me" | string>("me");
  const [workspacePlan, setWorkspacePlan] = useState<string | null>(null);
  const [upgradeReason, setUpgradeReason] = useState<"feature_locked" | null>(null);

  useEffect(() => {
    async function loadWorkspace() {
      try {
        const res = await fetch("/api/billing/workspace");
        const json = await res.json();
        if (json.workspace?.plan_key) {
          setWorkspacePlan(json.workspace.plan_key);
        }
      } catch (error) {
        console.error("Failed to load workspace plan:", error);
      }
    }
    loadWorkspace();
  }, []);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const params = new URLSearchParams();
      params.set("status", status);
      params.set("owner", owner);
      const res = await fetch(`/api/leads?${params.toString()}`);
      const json = await res.json();
      if (res.ok) setLeads(json.leads || []);
      setLoading(false);
    }
    load();
  }, [status, owner]);

  useEffect(() => {
    async function loadTopLeads() {
      setLoadingTopLeads(true);
      try {
        const res = await fetch("/api/leads/top");
        const json = await res.json();
        if (res.ok) setTopLeads(json || []);
      } catch (error) {
        console.error("Failed to load top leads:", error);
      } finally {
        setLoadingTopLeads(false);
      }
    }
    loadTopLeads();
  }, []);

  // Show upgrade wall for free plans
  if (workspacePlan === "free") {
    return (
      <div className="max-w-5xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Lead Queue</h1>
            <p className="text-[11px] text-gray-600">
              Hot and warm roofing leads that need attention now.
            </p>
          </div>
        </div>

        <div className="border rounded-2xl p-8 bg-white text-center space-y-4">
          <div className="text-lg font-semibold">Lead Queue is a Growth+ feature</div>
          <div className="text-sm text-gray-600">
            Upgrade to Growth or Domination to unlock the Lead Queue and see all your hot & warm leads in one place.
          </div>
          <button
            onClick={() => setUpgradeReason("feature_locked")}
            className="px-4 py-2 bg-black text-white rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors"
          >
            Upgrade to Growth
          </button>
        </div>

        {upgradeReason && (
          <UpgradeModal
            feature={upgradeReason}
            onClose={() => setUpgradeReason(null)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-6">
      {/* Call These First Section */}
      <div className="space-y-3">
        <h1 className="text-xl font-bold text-white">Call These First</h1>
        {loadingTopLeads && (
          <div className="text-[11px] text-gray-500">Loading top leads…</div>
        )}
        {!loadingTopLeads && topLeads.length === 0 && (
          <div className="text-[11px] text-gray-500">
            No leads with heat scores yet.
          </div>
        )}
        {!loadingTopLeads && topLeads.length > 0 && (
          <div className="grid gap-3">
            {topLeads.map((lead) => (
              <div
                key={lead.id}
                className="flex items-center justify-between rounded-xl border border-white/5 bg-white/5 p-3"
              >
                <div>
                  <div className="font-semibold text-white">{lead.name}</div>
                  <div className="text-xs text-gray-400">{lead.city}</div>
                </div>
                <LeadHeatScore score={lead.heat_score} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lead Queue Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Lead Queue</h2>
            <p className="text-[11px] text-gray-600">
              Hot and warm roofing leads that need attention now.
            </p>
          </div>

          <div className="flex items-center gap-2 text-[11px]">
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
              className="border rounded-xl px-2 py-1 bg-white"
            >
              <option value="all">All statuses</option>
              <option value="hot">Hot leads</option>
              <option value="warm">Warm leads</option>
              <option value="follow_up">Follow-up needed</option>
            </select>
            <select
              value={owner}
              onChange={(e) => setOwner(e.target.value as any)}
              className="border rounded-xl px-2 py-1 bg-white"
            >
              <option value="all">All owners</option>
              <option value="me">My leads</option>
              {/* later: inject team members here */}
            </select>
          </div>
        </div>

        {loading && (
          <div className="text-[11px] text-gray-500">Loading leads…</div>
        )}

        {!loading && leads.length === 0 && (
          <div className="text-[11px] text-gray-500">
            No hot or warm leads in the queue yet.
          </div>
        )}

        <div className="space-y-2">
          {leads.map((lead) => (
            <LeadRow key={lead.id} lead={lead} />
          ))}
        </div>
      </div>
    </div>
  );
}

function LeadRow({ lead }: { lead: Lead }) {
  const name =
    lead.first_name || lead.last_name
      ? `${lead.first_name || ""} ${lead.last_name || ""}`.trim()
      : lead.email || "Unknown contact";

  // Determine status display - use lead_status if available, otherwise use intent_label
  const displayStatus = lead.lead_status || 
    (lead.latest_intent_label === "hot_lead" ? "hot" :
     lead.latest_intent_label === "warm_lead" ? "warm" :
     lead.latest_intent_label === "follow_up" ? "follow_up" : null);

  const statusColor =
    displayStatus === "hot"
      ? "bg-red-100 text-red-700"
      : displayStatus === "warm"
      ? "bg-yellow-100 text-yellow-700"
      : "bg-slate-100 text-slate-600";

  const lastReply = lead.last_reply_at
    ? new Date(lead.last_reply_at).toLocaleString()
    : null;

  const snippet =
    lead.last_reply_snippet?.slice(0, 140) || "No reply text available.";

  return (
    <div className="border rounded-2xl p-3 bg-white flex items-start justify-between gap-3">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <div className="text-xs font-semibold truncate max-w-[200px]">
            {name}
          </div>
          {lead.city && (
            <div className="text-[10px] text-gray-500">{lead.city}</div>
          )}
          {displayStatus && (
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full ${statusColor}`}
            >
              {displayStatus.toUpperCase()}
            </span>
          )}
        </div>

        {lead.est_job_value && (
          <div className="text-[10px] text-gray-600 mt-1">
            Est. value: $
            {Number(lead.est_job_value).toLocaleString(undefined, {
              maximumFractionDigits: 0,
            })}
          </div>
        )}

        <div className="text-[10px] text-gray-400 mt-1">
          {lastReply ? `Last reply: ${lastReply}` : "No reply yet"}
        </div>

        <div className="text-[11px] text-gray-700 mt-1 line-clamp-2">
          {snippet}
        </div>
      </div>

      <div className="flex flex-col items-end gap-1 text-[11px]">
        <Link
          href={`/contacts/${lead.id}`}
          className="px-3 py-1.5 rounded-xl bg-black text-white hover:bg-gray-800 transition-colors"
        >
          Open contact
        </Link>

        {/* These can be wired to quick actions later */}
        {/* e.g. Mark Won / Mark Done APIs */}
      </div>
    </div>
  );
}


















