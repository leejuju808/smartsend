"use client";

import { useEffect, useState } from "react";
import { ReplyLabels } from "./ReplyLabels";
import { LeadIntentBadge } from "./LeadIntentBadge";

type ReplyItem = {
  reply_id: string;
  workspace_id: string;
  lead_id: string;
  campaign_id: string | null;
  sequence_id: string | null;
  body: string;
  metadata: any;
  received_at: string;
  company: string | null;
  first_name: string | null;
  last_name: string | null;
  lead_email: string | null;
  category: string | null;
  sentiment: string | null;
  intent_score: number | null;
  meeting_time: string | null;
  meeting_location: string | null;
  meeting_link: string | null;
  objection_type: string | null;
  lead_intent_classification: "HOT" | "WARM" | "NOT_INTERESTED" | "FOLLOW_UP" | "OUT_OF_SCOPE" | null;
  lead_intent_confidence: number | null;
};

export function InboxList({ 
  onSelect,
  onLeadClick 
}: { 
  onSelect: (item: ReplyItem) => void;
  onLeadClick?: (leadId: string) => void;
}) {
  const [items, setItems] = useState<ReplyItem[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const filters = window.inboxFilters || { search: "", category: "", sentiment: "" };

      const res = await fetch("/api/inbox/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...filters,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        console.error("Failed to load inbox:", error);
        setLoading(false);
        return;
      }

      const json = await res.json();
      setItems(json.replies || []);
    } catch (error) {
      console.error("Error loading inbox:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // Refresh every 1.5 seconds
    const interval = setInterval(load, 1500);
    return () => clearInterval(interval);
  }, []);

  // Listen for filter changes
  useEffect(() => {
    const handleFilterChange = () => {
      load();
    };
    window.addEventListener("inboxFiltersChanged", handleFilterChange);
    return () => window.removeEventListener("inboxFiltersChanged", handleFilterChange);
  }, []);

  if (loading) {
    return (
      <div className="p-4 text-sm text-muted-foreground">Loading replies...</div>
    );
  }

  return (
    <div className="space-y-2 overflow-y-auto h-[calc(100vh-8rem)]">
      {items.length === 0 ? (
        <div className="p-4 text-sm text-muted-foreground text-center">
          No replies found
        </div>
      ) : (
        items.map((i) => (
          <div
            key={i.reply_id}
            onClick={(e) => {
              // If clicking on the lead name/email area, open lead profile
              if (onLeadClick && (e.target as HTMLElement).closest('.lead-name-area')) {
                e.stopPropagation();
                onLeadClick(i.lead_id);
                return;
              }
              onSelect(i);
            }}
            className="border rounded p-3 hover:bg-muted cursor-pointer space-y-2 transition-colors"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-wrap gap-2 flex-1">
                <ReplyLabels 
                  intent={{
                    id: i.reply_id,
                    category: i.category,
                    sentiment: i.sentiment,
                    intent_score: i.intent_score,
                    meeting_time: i.meeting_time,
                    meeting_timezone: null,
                    meeting_location: i.meeting_location,
                    meeting_link: i.meeting_link,
                    objection_type: i.objection_type,
                  }}
                />
                {/* Block 10500: Lead Brain v1 - Show lead intent badge */}
                <LeadIntentBadge 
                  classification={i.lead_intent_classification}
                  confidence={i.lead_intent_confidence}
                />
              </div>
            </div>

            <div 
              className="text-sm font-medium lead-name-area cursor-pointer hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                if (onLeadClick) {
                  onLeadClick(i.lead_id);
                }
              }}
            >
              {i.first_name} {i.last_name}
            </div>

            <div className="text-xs text-muted-foreground truncate">
              {i.body}
            </div>

            <div className="text-[10px] text-muted-foreground">
              {new Date(i.received_at).toLocaleString()}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
