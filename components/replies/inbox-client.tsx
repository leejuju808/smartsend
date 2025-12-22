"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { LeadSidebar } from "@/components/leads/sidebar";
import { cn } from "@/lib/utils";

type Thread = {
  id: string;
  subject: string | null;
  last_message_at: string;
  last_direction: "inbound" | "outbound";
  ai_label: string | null;
  unread: boolean;
  is_archived: boolean;
  leads: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    company: string | null;
  } | null;
  campaigns: {
    id: string;
    name: string | null;
  } | null;
};

const LABELS: { id: string; name: string }[] = [
  { id: "all", name: "All" },
  { id: "meeting", name: "Meeting" },
  { id: "positive", name: "Interested" },
  { id: "neutral", name: "Neutral" },
  { id: "oos", name: "Out of scope" },
  { id: "unsubscribe", name: "Unsubscribe" },
  { id: "bounce", name: "Bounce" },
];

export function RepliesInboxClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeLeadId, setActiveLeadId] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<"unread" | "all">("unread");
  const [labelFilter, setLabelFilter] = useState<string>("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        params.set("status", statusFilter);
        if (labelFilter && labelFilter !== "all") params.set("label", labelFilter);
        if (query.trim()) params.set("q", query.trim());

        const res = await fetch(`/api/replies?${params.toString()}`);
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error ?? "Failed to load replies");
        }
        if (!cancelled) {
          setThreads(data.threads ?? []);
          if (!selectedId && data.threads?.length > 0) {
            setSelectedId(data.threads[0].id);
          }
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) setError("Could not load replies.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [statusFilter, labelFilter, query, selectedId]);

  const selectedThread = threads.find((t) => t.id === selectedId) ?? null;

  const mutateThread = async (id: string, action: "mark_read" | "mark_unread" | "archive") => {
    try {
      const res = await fetch(`/api/replies/${id}/mutate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) {
        console.error(data);
        return;
      }
      // Optimistic update
      setThreads((prev) =>
        prev
          .map((t) =>
            t.id === id
              ? {
                  ...t,
                  unread: action === "mark_unread" ? true : action === "mark_read" ? false : t.unread,
                  is_archived: action === "archive" ? true : t.is_archived,
                }
              : t
          )
          .filter((t) => !t.is_archived)
      );
      if (action === "archive" && selectedId === id) {
        setSelectedId(null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleOpenLead = (leadId?: string | null) => {
    if (!leadId) return;
    router.push(`/leads/${leadId}`);
  };

  const handleOpenCampaign = (campaignId?: string | null) => {
    if (!campaignId) return;
    router.push(`/campaigns/${campaignId}`);
  };

  return (
    <div className="min-h-screen bg-background flex items-start justify-center">
      <div className="w-full max-w-6xl px-4 py-6 space-y-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-xl font-semibold">Replies</h1>
          <p className="text-xs text-muted-foreground">
            View responses from your campaigns and quickly scan AI labels like{" "}
            <span className="font-mono text-[0.7rem]">meeting</span> or{" "}
            <span className="font-mono text-[0.7rem]">unsubscribe</span>.
          </p>
        </div>

        {/* Filter bar */}
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => setStatusFilter("unread")}
              className={cn(
                "px-3 py-1 rounded-full border text-xs",
                statusFilter === "unread"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border"
              )}
            >
              Unread
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("all")}
              className={cn(
                "px-3 py-1 rounded-full border text-xs",
                statusFilter === "all"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border"
              )}
            >
              All
            </button>
          </div>

          <div className="flex-1">
            <Input
              placeholder="Search by subject, email, or company"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-8 text-xs"
            />
          </div>

          <div className="flex items-center gap-1 overflow-x-auto">
            {LABELS.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setLabelFilter(l.id)}
                className={cn(
                  "px-2 py-1 rounded-full text-[0.7rem] border whitespace-nowrap",
                  labelFilter === l.id
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border"
                )}
              >
                {l.name}
              </button>
            ))}
          </div>
        </div>

        {/* Main layout: thread list + preview */}
        <div className="border rounded-2xl overflow-hidden bg-card">
          <div className="grid grid-cols-1 md:grid-cols-3">
            {/* Thread list */}
            <div className="border-r max-h-[640px] overflow-y-auto">
              {loading ? (
                <div className="p-4 text-xs text-muted-foreground">Loading replies…</div>
              ) : error ? (
                <div className="p-4 text-xs text-destructive">{error}</div>
              ) : threads.length === 0 ? (
                <div className="p-4 text-xs text-muted-foreground">
                  No replies yet matching this filter. Once prospects respond, they'll show up here.
                </div>
              ) : (
                <ul className="divide-y">
                  {threads.map((t) => {
                    const isSelected = selectedId === t.id;
                    const leadName =
                      t.leads?.first_name || t.leads?.last_name
                        ? `${t.leads?.first_name ?? ""} ${t.leads?.last_name ?? ""}`.trim()
                        : t.leads?.email ?? "Unknown lead";

                    return (
                      <li key={t.id}>
                        <button
                          type="button"
                          className={cn(
                            "w-full text-left px-3 py-3 flex flex-col gap-1 text-xs",
                            isSelected ? "bg-muted/80" : "hover:bg-muted/40"
                          )}
                          onClick={() => {
                            setSelectedId(t.id);
                            if (t.leads?.id) {
                              setActiveLeadId(t.leads.id);
                            }
                          }}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              {t.unread && (
                                <span className="h-2 w-2 rounded-full bg-primary" />
                              )}
                              <span
                                className={cn(
                                  "font-medium",
                                  t.unread && "text-foreground",
                                  !t.unread && "text-muted-foreground"
                                )}
                              >
                                {leadName}
                              </span>
                            </div>
                            <span className="text-[0.65rem] text-muted-foreground">
                              {new Date(t.last_message_at).toLocaleTimeString(undefined, {
                                hour: "numeric",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-2">
                            <div className="flex-1 truncate text-[0.7rem] text-muted-foreground">
                              {t.subject || "(no subject)"}
                            </div>
                            <ReplyLabelBadge label={t.ai_label} />
                          </div>

                          {t.leads?.company && (
                            <div className="text-[0.65rem] text-muted-foreground truncate">
                              {t.leads.company}
                            </div>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Right: simple preview / meta of selected thread */}
            <div className="md:col-span-2 max-h-[640px] overflow-y-auto p-4 flex flex-col gap-3">
              {!selectedThread ? (
                <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                  Select a reply thread to see details.
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h2 className="text-sm font-semibold">
                          {selectedThread.leads?.first_name ||
                          selectedThread.leads?.last_name
                            ? `${selectedThread.leads?.first_name ?? ""} ${
                                selectedThread.leads?.last_name ?? ""
                              }`.trim()
                            : selectedThread.leads?.email ?? "Unknown lead"}
                        </h2>
                        <ReplyLabelBadge label={selectedThread.ai_label} />
                      </div>
                      <div className="text-[0.7rem] text-muted-foreground space-x-2">
                        {selectedThread.leads?.email && (
                          <span>{selectedThread.leads.email}</span>
                        )}
                        {selectedThread.leads?.company && (
                          <>
                            <span>•</span>
                            <span>{selectedThread.leads.company}</span>
                          </>
                        )}
                      </div>
                      {selectedThread.campaigns?.name && (
                        <div className="text-[0.7rem] text-muted-foreground">
                          From campaign:{" "}
                          <button
                            className="underline hover:text-primary"
                            onClick={() =>
                              handleOpenCampaign(selectedThread.campaigns?.id)
                            }
                          >
                            {selectedThread.campaigns.name}
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-1 items-end">
                      <span className="text-[0.7rem] text-muted-foreground">
                        {new Date(selectedThread.last_message_at).toLocaleString()}
                      </span>
                      <div className="flex gap-1">
                        {selectedThread.unread ? (
                          <Button
                            size="xs"
                            variant="outline"
                            className="text-[0.7rem] h-7"
                            onClick={() => mutateThread(selectedThread.id, "mark_read")}
                          >
                            Mark read
                          </Button>
                        ) : (
                          <Button
                            size="xs"
                            variant="outline"
                            className="text-[0.7rem] h-7"
                            onClick={() => mutateThread(selectedThread.id, "mark_unread")}
                          >
                            Mark unread
                          </Button>
                        )}
                        <Button
                          size="xs"
                          variant="ghost"
                          className="text-[0.7rem] h-7"
                          onClick={() => mutateThread(selectedThread.id, "archive")}
                        >
                          Archive
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="border-t pt-3 text-xs text-muted-foreground">
                    <p>
                      Full thread view and AI summary will live here in a later block. For now,
                      SmartSend surfaces the latest label so you know who's{" "}
                      <span className="font-mono">meeting-ready</span> or{" "}
                      <span className="font-mono">unsubscribed</span> at a glance.
                    </p>
                  </div>

                  <div className="border-t pt-3 text-xs">
                    <Button
                      size="xs"
                      variant="outline"
                      className="text-[0.7rem] h-7"
                      onClick={() => handleOpenLead(selectedThread.leads?.id)}
                    >
                      Open lead record
                    </Button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Lead Sidebar Drawer */}
        <Sheet open={!!activeLeadId} onOpenChange={(open) => !open && setActiveLeadId(null)}>
          <SheetContent side="right" className="w-full sm:max-w-lg p-0 overflow-hidden">
            {activeLeadId && <LeadSidebar leadId={activeLeadId} />}
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}

function ReplyLabelBadge({ label }: { label: string | null }) {
  if (!label) {
    return (
      <Badge
        variant="outline"
        className="text-[0.65rem] border-muted-foreground/30 text-muted-foreground"
      >
        Unlabeled
      </Badge>
    );
  }

  const normalized = label.toLowerCase();

  let text = label;
  let className =
    "text-[0.65rem] border-muted-foreground/30 bg-muted text-muted-foreground";

  if (normalized === "meeting") {
    text = "Meeting";
    className = "text-[0.65rem] border-emerald-500/60 bg-emerald-50 text-emerald-700";
  } else if (normalized === "positive" || normalized === "interested") {
    text = "Interested";
    className = "text-[0.65rem] border-blue-500/60 bg-blue-50 text-blue-700";
  } else if (normalized === "neutral") {
    text = "Neutral";
    className = "text-[0.65rem] border-slate-400/60 bg-slate-50 text-slate-700";
  } else if (normalized === "oos" || normalized === "out_of_scope") {
    text = "Out of scope";
    className = "text-[0.65rem] border-amber-500/60 bg-amber-50 text-amber-700";
  } else if (normalized === "unsubscribe") {
    text = "Unsubscribe";
    className = "text-[0.65rem] border-rose-500/60 bg-rose-50 text-rose-700";
  } else if (normalized === "bounce") {
    text = "Bounce";
    className = "text-[0.65rem] border-zinc-500/60 bg-zinc-50 text-zinc-700";
  }

  return <Badge className={className}>{text}</Badge>;
}

