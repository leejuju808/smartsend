// Block 20090 — Inbox Search & Filter Bar
"use client";

import { useEffect, useState } from "react";

type LeadStage = "all" | "new" | "working" | "scheduled" | "won" | "lost";
type EngagementLevel = "all" | "hot" | "warm" | "cold";

interface InboxSearchBarProps {
  onResults: (conversations: any[]) => void;
  currentUserId?: string; // optional, for "My leads"
}

export function InboxSearchBar({
  onResults,
  currentUserId,
}: InboxSearchBarProps) {
  const [q, setQ] = useState("");
  const [leadStage, setLeadStage] = useState<LeadStage>("all");
  const [engagementLevel, setEngagementLevel] =
    useState<EngagementLevel>("all");
  const [claimsOnly, setClaimsOnly] = useState(false);
  const [myLeadsOnly, setMyLeadsOnly] = useState(false);
  const [loading, setLoading] = useState(false);

  async function runSearch() {
    setLoading(true);
    const params = new URLSearchParams({
      q,
      lead_stage: leadStage,
      engagement_level: engagementLevel,
      claims_only: claimsOnly ? "true" : "false",
    });

    if (myLeadsOnly && currentUserId) {
      params.set("assigned_to", currentUserId);
    } else {
      params.set("assigned_to", "all");
    }

    try {
      const res = await fetch(`/api/inbox/search?${params.toString()}`);
      const data = await res.json();
      onResults(data.conversations ?? []);
    } catch (error) {
      console.error("Search error:", error);
      onResults([]);
    } finally {
      setLoading(false);
    }
  }

  // Auto search on filter change (debounced for text input)
  useEffect(() => {
    const id = setTimeout(() => {
      runSearch();
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadStage, engagementLevel, claimsOnly, myLeadsOnly]);

  // Debounced search for text input
  useEffect(() => {
    const id = setTimeout(() => {
      if (q.length === 0 || q.length >= 2) {
        runSearch();
      }
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    runSearch();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mb-3 flex flex-wrap items-center gap-3"
    >
      <div className="flex-1 min-w-[200px]">
        <div className="relative">
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, email, address, message..."
            className="w-full border rounded-xl px-3 py-2 pl-9 text-sm"
          />
          <span className="absolute left-3 top-2.5 text-gray-400 text-xs">
            🔍
          </span>
        </div>
      </div>

      <select
        value={leadStage}
        onChange={(e) => setLeadStage(e.target.value as LeadStage)}
        className="border rounded-lg px-2 py-1 text-xs bg-white"
      >
        <option value="all">All stages</option>
        <option value="new">New</option>
        <option value="working">Working</option>
        <option value="scheduled">Scheduled</option>
        <option value="won">Won</option>
        <option value="lost">Lost</option>
      </select>

      <select
        value={engagementLevel}
        onChange={(e) =>
          setEngagementLevel(e.target.value as EngagementLevel)
        }
        className="border rounded-lg px-2 py-1 text-xs bg-white"
      >
        <option value="all">All heat</option>
        <option value="hot">Hot</option>
        <option value="warm">Warm</option>
        <option value="cold">Cold</option>
      </select>

      <label className="flex items-center gap-1 text-xs text-gray-600">
        <input
          type="checkbox"
          checked={claimsOnly}
          onChange={(e) => setClaimsOnly(e.target.checked)}
        />
        Claims only
      </label>

      {currentUserId && (
        <label className="flex items-center gap-1 text-xs text-gray-600">
          <input
            type="checkbox"
            checked={myLeadsOnly}
            onChange={(e) => setMyLeadsOnly(e.target.checked)}
          />
          My leads
        </label>
      )}

      <button
        type="submit"
        className="px-3 py-1 rounded-full border border-gray-300 hover:border-black text-xs"
        disabled={loading}
      >
        {loading ? "Searching…" : "Search"}
      </button>
    </form>
  );
}

















































