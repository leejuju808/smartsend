// Block 19600 — SmartSend Owner Inbox v1
// The Unified Roofing Inbox: All Replies, All Channels, AI Sorting, Lead Ranking & Action Buttons

"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Settings } from "lucide-react";
import InboxReplyList from "@/components/inbox-v1/InboxReplyList";
import InboxLeadCard from "@/components/inbox-v1/InboxLeadCard";
import InboxFilters from "@/components/inbox-v1/InboxFilters";
import InboxSettingsModal from "@/components/inbox-v1/InboxSettingsModal";

type Reply = {
  thread_id: string;
  message_id: string;
  campaign_id: string;
  lead_id: string;
  homeowner_name: string;
  homeowner_email: string;
  subject: string;
  last_message_preview: string;
  last_message_at: string;
  ai_intent_tag: string | null;
  ai_intent_confidence: number | null;
  lead_ranking_score: number | null;
  unread_count: number;
  lead_value_range: string | null;
  follow_up_timer_hours: number | null;
};

type IntentFilter = "hot_lead" | "warm_lead" | "cold_lead" | "dead_lead" | "follow_up_needed" | null;

export default function OwnerInboxV1Page() {
  const searchParams = useSearchParams();
  const [replies, setReplies] = useState<Reply[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(
    searchParams.get("thread") || null
  );
  const [loading, setLoading] = useState(true);
  const [intentFilter, setIntentFilter] = useState<IntentFilter>(null);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const supabase = createClientComponentClient();

  // Load default tab from settings on mount
  useEffect(() => {
    async function loadDefaultTab() {
      try {
        const response = await fetch("/api/inbox/settings");
        if (response.ok) {
          const data = await response.json();
          if (data.settings?.default_tab) {
            const defaultTab = data.settings.default_tab;
            // Map default_tab enum to IntentFilter
            const tabMap: Record<string, IntentFilter> = {
              all: null,
              hot: "hot_lead",
              warm: "warm_lead",
              follow_up: "follow_up_needed",
            };
            const mappedFilter = tabMap[defaultTab];
            if (mappedFilter !== undefined) {
              setIntentFilter(mappedFilter);
            }
          }
        }
      } catch (error) {
        console.error("Error loading default tab:", error);
      }
    }
    loadDefaultTab();
  }, []);

  useEffect(() => {
    loadReplies();
  }, [intentFilter, campaignId]);

  // Real-time updates via Supabase channel
  useEffect(() => {
    const channel = supabase
      .channel("inbox-replies-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "inbox_messages",
        },
        (payload) => {
          // Reload replies when new messages arrive
          loadReplies();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "inbox_threads",
        },
        (payload) => {
          // Reload replies when threads are updated
          loadReplies();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  async function loadReplies() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (intentFilter) params.append("intent", intentFilter);
      if (campaignId) params.append("campaignId", campaignId);

      const res = await fetch(`/api/inbox/replies?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setReplies(data.replies || []);
      }
    } catch (error) {
      console.error("Error loading replies:", error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-64px)] bg-neutral-50">
      {/* Left Panel: Reply List */}
      <div className="w-96 border-r border-neutral-200 bg-white flex flex-col">
        <div className="p-4 border-b border-neutral-200">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-semibold text-neutral-900">Owner Inbox</h1>
              <p className="text-sm text-neutral-500 mt-1">
                All replies, all channels, AI sorted
              </p>
            </div>
            <button
              onClick={() => setSettingsModalOpen(true)}
              className="p-2 rounded-lg hover:bg-neutral-100 transition-colors text-neutral-600 hover:text-neutral-900"
              title="Inbox Settings"
            >
              <Settings className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Filters */}
        <InboxFilters
          intentFilter={intentFilter}
          onIntentFilterChange={setIntentFilter}
          campaignId={campaignId}
          onCampaignIdChange={setCampaignId}
        />

        {/* Reply List */}
        <div className="flex-1 overflow-y-auto">
          <InboxReplyList
            replies={replies}
            loading={loading}
            selectedThreadId={selectedThreadId}
            onSelectThread={setSelectedThreadId}
          />
        </div>
      </div>

      {/* Right Panel: Lead Card */}
      <div className="flex-1 overflow-y-auto bg-white">
        {selectedThreadId ? (
          <InboxLeadCard
            threadId={selectedThreadId}
            onClose={() => setSelectedThreadId(null)}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-neutral-400">
            <div className="text-center">
              <p className="text-lg font-medium">Select a reply to view details</p>
              <p className="text-sm mt-2">Click on any reply in the list to see the lead card</p>
            </div>
          </div>
        )}
      </div>

      {/* Settings Modal */}
      <InboxSettingsModal
        open={settingsModalOpen}
        onOpenChange={setSettingsModalOpen}
        onSettingsSaved={() => {
          // Reload replies to apply new priority weights
          loadReplies();
        }}
      />
    </div>
  );
}

