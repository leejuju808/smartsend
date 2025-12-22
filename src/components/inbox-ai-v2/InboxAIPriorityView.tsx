/**
 * Block 24180 — SmartSend Roofing Inbox AI v2
 * Inbox Priority View Component
 * 
 * Displays inbox threads sorted by priority:
 * 🔥 HOT leads first
 * 🟧 Warm leads
 * 💵 Quote requests
 * 📅 Scheduling
 * Other
 * ❄️ Cold replies
 * 🚫 Not interested
 */

"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { getThreadsByIntent, type PrioritizedThread } from "@/lib/inboxAiV2/queries";

const INTENT_LABELS = {
  hot_lead: { emoji: "🔥", label: "HOT Leads", color: "text-red-600" },
  warm_lead: { emoji: "🟧", label: "Warm Leads", color: "text-orange-600" },
  quote_request: { emoji: "💵", label: "Quote Requests", color: "text-yellow-600" },
  inspection_scheduling: { emoji: "📅", label: "Scheduling", color: "text-blue-600" },
  appointment_confirmed: { emoji: "✔️", label: "Confirmed", color: "text-green-600" },
  cold_reply: { emoji: "❄️", label: "Cold Replies", color: "text-gray-500" },
  not_interested: { emoji: "🚫", label: "Not Interested", color: "text-gray-400" },
  other: { emoji: "📧", label: "Other", color: "text-gray-600" }
};

const INTENT_ORDER = [
  "hot_lead",
  "warm_lead",
  "quote_request",
  "inspection_scheduling",
  "appointment_confirmed",
  "other",
  "cold_reply",
  "not_interested"
];

interface InboxAIPriorityViewProps {
  campaignId?: string;
  onThreadSelect?: (threadId: string) => void;
}

export default function InboxAIPriorityView({
  campaignId,
  onThreadSelect
}: InboxAIPriorityViewProps) {
  const [threadsByIntent, setThreadsByIntent] = useState<Record<string, PrioritizedThread[]>>({});
  const [loading, setLoading] = useState(true);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(["hot_lead", "warm_lead"])
  );

  useEffect(() => {
    loadThreads();
  }, [campaignId]);

  async function loadThreads() {
    setLoading(true);
    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      
      const grouped = await getThreadsByIntent(supabase, campaignId);
      setThreadsByIntent(grouped);
    } catch (error) {
      console.error("Error loading threads:", error);
    } finally {
      setLoading(false);
    }
  }

  function toggleSection(intentLabel: string) {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(intentLabel)) {
      newExpanded.delete(intentLabel);
    } else {
      newExpanded.add(intentLabel);
    }
    setExpandedSections(newExpanded);
  }

  function formatTimeAgo(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  if (loading) {
    return (
      <div className="p-4">
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-20 bg-gray-200 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  const totalThreads = Object.values(threadsByIntent).reduce((sum, threads) => sum + threads.length, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b">
        <h2 className="text-lg font-semibold">Inbox AI v2</h2>
        <span className="text-sm text-gray-600">{totalThreads} threads</span>
      </div>

      {INTENT_ORDER.map(intentLabel => {
        const threads = threadsByIntent[intentLabel] || [];
        if (threads.length === 0) return null;

        const config = INTENT_LABELS[intentLabel as keyof typeof INTENT_LABELS];
        const isExpanded = expandedSections.has(intentLabel);

        return (
          <div key={intentLabel} className="border-b">
            <button
              onClick={() => toggleSection(intentLabel)}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-xl">{config.emoji}</span>
                <span className={`font-medium ${config.color}`}>{config.label}</span>
                <span className="text-sm text-gray-500">({threads.length})</span>
              </div>
              <svg
                className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {isExpanded && (
              <div className="bg-white">
                {threads.map(thread => (
                  <div
                    key={thread.id}
                    onClick={() => onThreadSelect?.(thread.id)}
                    className="px-4 py-3 border-t hover:bg-blue-50 cursor-pointer transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-gray-900 truncate">
                            {thread.lead?.first_name && thread.lead?.last_name
                              ? `${thread.lead.first_name} ${thread.lead.last_name}`
                              : thread.lead?.email || "Unknown"}
                          </span>
                          {thread.unread_count > 0 && (
                            <span className="px-2 py-0.5 bg-blue-600 text-white text-xs rounded-full">
                              {thread.unread_count}
                            </span>
                          )}
                        </div>
                        {thread.subject && (
                          <div className="text-sm text-gray-600 truncate mb-1">
                            {thread.subject}
                          </div>
                        )}
                        {thread.latest_message && (
                          <div className="text-sm text-gray-500 truncate">
                            {thread.latest_message.body}
                          </div>
                        )}
                      </div>
                      <div className="ml-4 text-xs text-gray-400 whitespace-nowrap">
                        {formatTimeAgo(thread.last_message_at)}
                      </div>
                    </div>
                    {thread.priority_score && thread.priority_score > 80 && (
                      <div className="mt-2">
                        <span className="text-xs text-red-600 font-medium">
                          Priority: {Math.round(thread.priority_score)}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}






































