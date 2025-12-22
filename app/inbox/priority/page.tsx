// Block 20040 — Inbox Page Priority Integration
// Block 20090 — Added Search & Filters
"use client";

import { useEffect, useState } from "react";
import { InboxPriorityFilters } from "@/components/inbox/InboxPriorityFilters";
import { InboxSearchBar } from "@/components/inbox/InboxSearchBar";
import { InboxOwnerHud } from "@/components/inbox/InboxOwnerHud";
import { FollowUpTodayPanel } from "@/components/inbox/FollowUpTodayPanel";
import { InboxAlertsPanel } from "@/components/inbox/InboxAlertsPanel";
import HomeownerIntelCard from "@/components/inbox/HomeownerIntelCard";

type EngagementFilter = "all" | "hot" | "warm" | "cold";
type SortMode = "priority" | "newest" | "oldest";

type Conversation = {
  id: string;
  homeowner_name: string;
  homeowner_email: string;
  property_address?: string;
  last_message_preview: string;
  engagement_level: string | null;
  engagement_score: number;
  lead_stage?: string;
  estimated_job_value?: number;
  unread_inbound_count?: number;
  status: string;
  updated_at: string;
  last_message_at: string;
  created_at: string;
  contact_id: string | null;
  campaign_id: string;
};

export default function InboxPriorityPage() {
  const [engagementFilter, setEngagementFilter] = useState<EngagementFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("priority");
  const [convos, setConvos] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [useSearch, setUseSearch] = useState(false);

  // Get current user ID (you can get this from auth context)
  const currentUserId = undefined; // TODO: Get from auth context

  async function loadDefault() {
    setLoading(true);
    setUseSearch(false);
    try {
      const params = new URLSearchParams({
        status: "open",
        sort: sortMode,
        engagement_level: engagementFilter,
      });
      const res = await fetch(`/api/inbox/list?${params.toString()}`);
      const data = await res.json();
      setConvos(data.conversations ?? []);
    } catch (error) {
      console.error("Failed to load conversations:", error);
    } finally {
      setLoading(false);
    }
  }

  function handleSearchResults(conversations: Conversation[]) {
    setUseSearch(true);
    setConvos(conversations);
  }

  useEffect(() => {
    if (!useSearch) {
      loadDefault();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engagementFilter, sortMode]);

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold mb-1">Inbox</h1>

      <InboxOwnerHud />

      <InboxSearchBar
        onResults={handleSearchResults}
        currentUserId={currentUserId}
      />

      <InboxPriorityFilters
        engagementFilter={engagementFilter}
        sortMode={sortMode}
        onChangeFilter={setEngagementFilter}
        onChangeSort={setSortMode}
      />

      {loading && (
        <p className="text-xs text-gray-500">Loading conversations…</p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: list */}
        <div className="lg:col-span-2 space-y-2">
          {convos.length === 0 && !loading && (
            <p className="text-sm text-gray-500 text-center py-8">
              {useSearch
                ? "No conversations match your search criteria."
                : "No conversations found."}
            </p>
          )}
          {convos.map((c) => (
            <div
              key={c.id}
              className="p-3 rounded-xl border hover:border-black cursor-pointer flex justify-between items-center"
              onClick={() => {
                // Mark as viewed when opening a conversation
                fetch("/api/inbox/view", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ conversation_id: c.id }),
                }).catch((err) => {
                  console.error("Failed to mark conversation as viewed:", err);
                });
              }}
            >
              <div className="flex items-center gap-2">
                {c.unread_inbound_count && c.unread_inbound_count > 0 && (
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-semibold">
                    {c.unread_inbound_count}
                  </span>
                )}
                <div>
                  <p className="font-medium text-sm">
                    {c.homeowner_name ?? c.homeowner_email}
                  </p>
                  <p className="text-xs text-gray-500 truncate max-w-xs">
                    {c.last_message_preview}
                  </p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    Stage: {c.lead_stage || "new"} ·{" "}
                    {c.engagement_level
                      ? c.engagement_level.toUpperCase()
                      : "UNRANKED"}
                  </p>
                </div>
              </div>
              <div className="text-right text-xs text-gray-500">
                <p>Score: {c.engagement_score ?? 0}</p>
                {c.estimated_job_value && (
                  <p>
                    Est: $
                    {Number(c.estimated_job_value).toLocaleString()}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Right: follow-up panel etc. */}
        <div className="space-y-4">
          <InboxAlertsPanel />
          <FollowUpTodayPanel />
          {/* Later: selected conversation panel */}
          {convos[0] && <HomeownerIntelCard convo={convos[0]} />}
        </div>
      </div>
    </div>
  );
}

