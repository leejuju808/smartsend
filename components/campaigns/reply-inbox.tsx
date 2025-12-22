// components/campaigns/reply-inbox.tsx

"use client";

import * as React from "react";
import { createClient } from "@/utils/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LeadStatusBadge } from "@/components/leads/lead-status-badge";
import { Loader2, RefreshCw } from "lucide-react";

type ReplyInboxProps = {
  workspaceId: string;
  campaignId: string;
};

type ReplyItem = {
  inbound_id: string;
  created_at: string;
  subject: string | null;
  text_body: string | null;
  from_email: string;
  intent_label: string | null;
  intent_confidence: number | null;
  lead_id: string | null;
  lead_first_name: string | null;
  lead_last_name: string | null;
  lead_status: string | null;
  lead_last_replied_at: string | null;
};

export function ReplyInbox({ workspaceId, campaignId }: ReplyInboxProps) {
  const supabase = React.useMemo(() => createClient(), []);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [items, setItems] = React.useState<ReplyItem[]>([]);
  const [classifyingId, setClassifyingId] = React.useState<string | null>(null);

  const fetchReplies = React.useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("inbound_messages")
      .select(
        `
        id,
        created_at,
        subject,
        text_body,
        from_email,
        intent_label,
        intent_confidence,
        lead_id,
        leads (
          id,
          first_name,
          last_name,
          status,
          last_replied_at
        )
      `
      )
      .eq("workspace_id", workspaceId)
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error(error);
      setItems([]);
      setLoading(false);
      return;
    }

    const mapped: ReplyItem[] =
      (data || []).map((row: any) => ({
        inbound_id: row.id,
        created_at: row.created_at,
        subject: row.subject,
        text_body: row.text_body,
        from_email: row.from_email,
        intent_label: row.intent_label ?? null,
        intent_confidence: row.intent_confidence ?? null,
        lead_id: row.lead_id ?? row.leads?.id ?? null,
        lead_first_name: row.leads?.first_name ?? null,
        lead_last_name: row.leads?.last_name ?? null,
        lead_status: row.leads?.status ?? null,
        lead_last_replied_at: row.leads?.last_replied_at ?? null,
      })) || [];

    setItems(mapped);
    setLoading(false);
  }, [supabase, workspaceId, campaignId]);

  React.useEffect(() => {
    fetchReplies();
  }, [fetchReplies]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchReplies();
    setRefreshing(false);
  };

  const renderSnippet = (text: string | null) => {
    if (!text) return "No preview available.";
    const trimmed = text.replace(/\s+/g, " ").trim();
    if (trimmed.length <= 140) return trimmed;
    return trimmed.slice(0, 140) + "…";
  };

  const renderIntentLabel = (label: string | null, conf: number | null) => {
    if (!label) return null;

    const normalized = label.toLowerCase();
    const pct =
      conf != null ? `${Math.round(conf * 100)}%` : undefined;

    const colorClasses =
      normalized === "interested" || normalized === "meeting_booked"
        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
        : normalized === "not_interested"
        ? "bg-rose-50 text-rose-700 border-rose-200"
        : normalized === "ooo"
        ? "bg-slate-50 text-slate-700 border-slate-200"
        : "bg-indigo-50 text-indigo-700 border-indigo-200";

    return (
      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${colorClasses}`}>
        {normalized.replace(/_/g, " ")}
        {pct && <span className="ml-1 opacity-60">({pct})</span>}
      </span>
    );
  };

  const handleClassify = async (inboundId: string) => {
    setClassifyingId(inboundId);
    try {
      const res = await fetch(`/api/replies/${inboundId}/classify`, {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok || !data.label) {
        console.error("Classify error:", data);
        alert("Failed to classify this reply.");
        return;
      }

      // Update the item in local state
      setItems((prev) =>
        prev.map((item) =>
          item.inbound_id === inboundId
            ? {
                ...item,
                intent_label: data.label,
                intent_confidence: data.confidence ?? null,
              }
            : item
        )
      );
    } catch (err) {
      console.error("Classify error:", err);
      alert("Failed to classify this reply. Check console.");
    } finally {
      setClassifyingId(null);
    }
  };

  return (
    <Card className="flex h-[360px] flex-col border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <div className="flex flex-col">
          <span className="text-sm font-medium">Latest Replies</span>
          <span className="text-xs text-muted-foreground">
            Leads who responded to this campaign
          </span>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={handleRefresh}
          disabled={refreshing || loading}
          className="h-8 w-8 p-0"
        >
          <RefreshCw
            className={`h-4 w-4 ${
              refreshing ? "animate-spin" : ""
            }`}
          />
          <span className="sr-only">Refresh</span>
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="space-y-2 p-3">
          {loading ? (
            <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading replies…
            </div>
          ) : items.length === 0 ? (
            <div className="flex h-[260px] items-center justify-center text-center text-sm text-muted-foreground">
              No replies yet for this campaign.
            </div>
          ) : (
            items.map((item) => {
              const name = [item.lead_first_name, item.lead_last_name]
                .filter(Boolean)
                .join(" ");

              const displayName =
                name || item.from_email || "Unknown contact";

              const repliedAt = new Date(
                item.created_at
              ).toLocaleString();

              return (
                <div
                  key={item.inbound_id}
                  className="flex flex-col gap-1 rounded-lg border bg-background px-3 py-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">
                        {displayName}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {item.from_email}
                      </span>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <LeadStatusBadge status={item.lead_status} />
                      <span className="text-[10px] text-muted-foreground">
                        {repliedAt}
                      </span>
                    </div>
                  </div>

                  {/* Intent label + classify button row */}
                  <div className="flex items-center justify-between gap-2">
                    <div>{renderIntentLabel(item.intent_label, item.intent_confidence)}</div>
                    <button
                      type="button"
                      className="text-[10px] text-primary underline-offset-2 hover:underline disabled:opacity-50"
                      onClick={() => handleClassify(item.inbound_id)}
                      disabled={classifyingId === item.inbound_id}
                    >
                      {classifyingId === item.inbound_id
                        ? "Classifying..."
                        : item.intent_label
                        ? "Reclassify"
                        : "Classify"}
                    </button>
                  </div>

                  {item.subject && (
                    <div className="text-xs font-medium text-foreground">
                      {item.subject}
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground">
                    {renderSnippet(item.text_body)}
                  </p>
                </div>
              );
            })
          )}
        </div>
      </div>
    </Card>
  );
}

