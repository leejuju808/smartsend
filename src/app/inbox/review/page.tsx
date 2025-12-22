/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClientComponentClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";

type RawQueueItem = {
  id: string;
  thread_id: string;
  message_id: string;
  reason: string;
  scores: Record<string, number> | null;
  created_at: string | null;
};

type ReviewItem = RawQueueItem & {
  subject: string | null;
  snippet: string;
  direction: string | null;
  topLabel: string | null;
  topConf: number | null;
  scores: Record<string, number>;
};

type MessageMetadata = {
  thread_id: string | null;
  subject: string | null;
  snippet: string;
  direction: string | null;
  created_at: string | null;
};

const LABEL_ORDER = [
  "positive",
  "neutral",
  "objection",
  "meeting_intent",
  "out_of_office",
  "unsubscribe",
  "bounce",
  "other",
] as const;

const LABEL_DISPLAY: Record<string, string> = {
  positive: "Positive",
  neutral: "Neutral",
  objection: "Objection",
  meeting_intent: "Meeting Intent",
  out_of_office: "Out of Office",
  unsubscribe: "Unsubscribe",
  bounce: "Bounce",
  other: "Other",
};

const LABEL_COLORS: Record<string, string> = {
  positive: "bg-emerald-500",
  neutral: "bg-slate-400",
  objection: "bg-rose-500",
  meeting_intent: "bg-indigo-500",
  out_of_office: "bg-amber-500",
  unsubscribe: "bg-fuchsia-500",
  bounce: "bg-orange-500",
  other: "bg-zinc-500",
};

const REASON_OPTIONS = [
  { value: "all", label: "All" },
  { value: "high_entropy", label: "High Entropy" },
  { value: "threshold_border", label: "Threshold Border" },
  { value: "model_conflict", label: "Model Conflict" },
  { value: "low_confidence", label: "Low Confidence" },
] as const;

const REASON_LABEL: Record<string, string> = {
  high_entropy: "High Entropy",
  threshold_border: "Threshold Border",
  model_conflict: "Model Conflict",
  low_confidence: "Low Confidence",
};

const KEYBINDS: Record<string, (typeof LABEL_ORDER)[number] | "skip"> = {
  Digit1: "positive",
  Digit2: "neutral",
  Digit3: "objection",
  Digit4: "meeting_intent",
  Digit5: "out_of_office",
  Digit6: "unsubscribe",
  Digit7: "bounce",
  Digit0: "other",
  KeyS: "skip",
};

function normalizeScores(scores: Record<string, number> | null | undefined) {
  const entries = Object.entries(scores ?? {}).map(([label, value]) => [
    label,
    typeof value === "number" ? value : Number(value),
  ]);
  const result: Record<string, number> = {};
  for (const [label, value] of entries) {
    const safeValue = Number.isFinite(value) ? value : 0;
    result[label] = safeValue < 0 ? 0 : safeValue;
  }

  const total = Object.values(result).reduce((sum, value) => sum + value, 0);
  if (total > 0) {
    for (const key of Object.keys(result)) {
      result[key] = result[key] / total;
    }
  }

  return result;
}

function pickTop(scores: Record<string, number>): { label: string | null; conf: number | null } {
  let best: { label: string | null; conf: number | null } = { label: null, conf: null };
  for (const [label, conf] of Object.entries(scores)) {
    if (best.label === null || (best.conf ?? 0) < conf) {
      best = { label, conf };
    }
  }
  return best;
}

function formatPercent(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return "—";
  }
  return `${Math.round(value * 1000) / 10}%`;
}

async function fetchQueue(ownerId: string, limit: number) {
  const response = await fetch("/api/label-review/pull", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ owner_id: ownerId, k: limit }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error?.error || "Failed to load review queue");
  }
  const json = await response.json();
  return Array.isArray(json?.items) ? (json.items as RawQueueItem[]) : [];
}

async function fetchMessageMetadata(messageIds: string[]) {
  if (!messageIds.length) return {};
  const response = await fetch("/api/label-review/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message_ids: messageIds }),
  });
  if (!response.ok) {
    return {};
  }
  const json = await response.json().catch(() => ({}));
  return (json?.items ?? {}) as Record<string, MessageMetadata>;
}

async function submitGoldLabel(payload: {
  owner_id: string;
  queue_id: string;
  thread_id: string;
  message_id: string;
  gold_label: string;
  notes?: string;
}) {
  const response = await fetch("/api/label-review/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const json = await response.json().catch(() => ({}));
    throw new Error(json?.error || "Failed to submit label");
  }
  return response.json();
}

async function skipQueueItem(queueId: string) {
  const response = await fetch("/api/label-review/skip", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ queue_id: queueId }),
  });
  if (!response.ok) {
    const json = await response.json().catch(() => ({}));
    throw new Error(json?.error || "Failed to skip item");
  }
}

export default function LabelReviewPage() {
  const supabase = useMemo(() => createClientComponentClient(), []);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [reasonFilter, setReasonFilter] = useState<(typeof REASON_OPTIONS)[number]["value"]>("all");
  const [activeIndex, setActiveIndex] = useState(0);
  const [notesByQueue, setNotesByQueue] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const notesRef = useRef<HTMLTextAreaElement | null>(null);
  const isTypingNotes = useRef(false);

  const load = useCallback(
    async (userId: string) => {
      setLoading(true);
      setError(null);
      try {
        const queue = await fetchQueue(userId, 40);
        const metadata = await fetchMessageMetadata(queue.map((item) => item.message_id));
        const enriched: ReviewItem[] = queue.map((item) => {
          const scores = normalizeScores(item.scores);
          const { label, conf } = pickTop(scores);
          const meta = metadata[item.message_id] ?? null;
          return {
            ...item,
            scores,
            topLabel: label,
            topConf: conf,
            subject: meta?.subject ?? null,
            snippet: meta?.snippet ?? "",
            direction: meta?.direction ?? null,
          };
        });
        setItems(enriched);
        setActiveIndex(0);
      } catch (err: any) {
        setError(err?.message ?? String(err));
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const refreshQueue = useCallback(async () => {
    if (!ownerId) return;
    setRefreshing(true);
    try {
      const queue = await fetchQueue(ownerId, 40);
      const metadata = await fetchMessageMetadata(queue.map((item) => item.message_id));
      setItems((prev) => {
        const normalized: ReviewItem[] = queue.map((item) => {
          const scores = normalizeScores(item.scores);
          const { label, conf } = pickTop(scores);
          const meta = metadata[item.message_id] ?? null;
          return {
            ...item,
            scores,
            topLabel: label,
            topConf: conf,
            subject: meta?.subject ?? null,
            snippet: meta?.snippet ?? "",
            direction: meta?.direction ?? null,
          };
        });
        return normalized;
      });
      setActiveIndex(0);
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setRefreshing(false);
    }
  }, [ownerId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!cancelled) {
        setOwnerId(user?.id ?? null);
        if (user?.id) {
          load(user.id);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setActiveIndex(0);
  }, [reasonFilter]);

  const filteredItems = useMemo(() => {
    if (reasonFilter === "all") return items;
    return items.filter((item) => item.reason === reasonFilter);
  }, [items, reasonFilter]);

  const activeItem = filteredItems[activeIndex] ?? null;

  useEffect(() => {
    if (!activeItem) return;
    setNotesByQueue((prev) => {
      if (prev[activeItem.id] !== undefined) return prev;
      return { ...prev, [activeItem.id]: "" };
    });
  }, [activeItem?.id]);

  const activeNotes = activeItem ? notesByQueue[activeItem.id] ?? "" : "";

  const handleSelect = useCallback(
    (queueId: string) => {
      const index = filteredItems.findIndex((item) => item.id === queueId);
      if (index >= 0) {
        setActiveIndex(index);
      }
    },
    [filteredItems],
  );

  const applyLabel = useCallback(
    async (label: (typeof LABEL_ORDER)[number]) => {
      if (!ownerId || !activeItem) return;
      try {
        const remainingCount = items.length - 1;
        await submitGoldLabel({
          owner_id: ownerId,
          queue_id: activeItem.id,
          thread_id: activeItem.thread_id,
          message_id: activeItem.message_id,
          gold_label: label,
          notes: activeNotes?.trim() ? activeNotes.trim() : undefined,
        });
        setItems((prev) => prev.filter((item) => item.id !== activeItem.id));
        setNotesByQueue((prev) => {
          const { [activeItem.id]: _, ...rest } = prev;
          return rest;
        });
        setActiveIndex((prevIndex) => Math.max(prevIndex - 1, 0));
        if (remainingCount <= 5 && ownerId) {
          refreshQueue();
        }
      } catch (err: any) {
        setError(err?.message ?? String(err));
      }
    },
    [ownerId, activeItem, activeNotes, items.length, refreshQueue],
  );

  const skipActive = useCallback(async () => {
    if (!activeItem) return;
    try {
      const remainingCount = items.length - 1;
      await skipQueueItem(activeItem.id);
      setItems((prev) => prev.filter((item) => item.id !== activeItem.id));
      setNotesByQueue((prev) => {
        const { [activeItem.id]: _, ...rest } = prev;
        return rest;
      });
      setActiveIndex((prevIndex) => Math.max(prevIndex - 1, 0));
      if (remainingCount <= 5 && ownerId) {
        refreshQueue();
      }
    } catch (err: any) {
      setError(err?.message ?? String(err));
    }
  }, [activeItem, ownerId, items.length, refreshQueue]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (isTypingNotes.current) return;
      const mapped = KEYBINDS[event.code];
      if (!mapped || (event.metaKey || event.ctrlKey || event.altKey)) return;
      event.preventDefault();
      if (mapped === "skip") {
        skipActive();
      } else {
        applyLabel(mapped);
      }
    };
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
    };
  }, [applyLabel, skipActive]);

  useEffect(() => {
    const element = notesRef.current;
    if (!element) return;
    const handleFocus = () => {
      isTypingNotes.current = true;
    };
    const handleBlur = () => {
      isTypingNotes.current = false;
    };
    element.addEventListener("focus", handleFocus);
    element.addEventListener("blur", handleBlur);
    return () => {
      element.removeEventListener("focus", handleFocus);
      element.removeEventListener("blur", handleBlur);
    };
  }, [activeItem?.id]);

  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Label Review</h1>
          <p className="text-sm text-muted-foreground">
            Keyboard: 1=Positive · 2=Neutral · 3=Objection · 4=Meeting · 5=OOO · 6=Unsub · 7=Bounce · 0=Other · S=Skip
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className="text-sm">
            Open: {items.length}
          </Badge>
          <Button variant="outline" size="sm" onClick={refreshQueue} disabled={refreshing || loading}>
            {refreshing ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {REASON_OPTIONS.map((option) => {
          const isActive = reasonFilter === option.value;
          return (
            <Button
              key={option.value}
              variant={isActive ? "default" : "outline"}
              size="sm"
              onClick={() => setReasonFilter(option.value)}
            >
              {option.label}
            </Button>
          );
        })}
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex flex-1 gap-4">
        <Card className="w-full max-w-sm overflow-hidden">
          <CardHeader className="border-b">
            <CardTitle className="text-base">Queue</CardTitle>
            <CardDescription>Riskiest threads that need review</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Skeleton key={index} className="h-16 w-full" />
                ))}
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">No items match this filter. Great job!</div>
            ) : (
              <ul className="divide-y">
                {filteredItems.map((item, index) => {
                  const isActive = index === activeIndex;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => handleSelect(item.id)}
                        className={`flex w-full flex-col items-start gap-2 px-4 py-3 text-left transition ${
                          isActive ? "bg-muted" : "hover:bg-muted/50"
                        }`}
                      >
                        <div className="flex w-full items-center gap-2">
                          <Badge variant="outline">
                            {REASON_LABEL[item.reason] ?? item.reason}
                          </Badge>
                          {item.topLabel && (
                            <Badge className={`${LABEL_COLORS[item.topLabel] ?? "bg-slate-500"}`}>
                              {LABEL_DISPLAY[item.topLabel] ?? item.topLabel}
                            </Badge>
                          )}
                          <span className="ml-auto text-xs text-muted-foreground">
                            {item.created_at ? new Date(item.created_at).toLocaleString() : ""}
                          </span>
                        </div>
                        <div className="w-full truncate text-sm font-medium">
                          {item.subject ?? "(no subject)"}
                        </div>
                        <div className="line-clamp-2 w-full text-xs text-muted-foreground">
                          {item.snippet || "—"}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="flex-1">
          {loading && !activeItem ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-64" />
              <Skeleton className="h-36 w-full" />
              <Skeleton className="h-10 w-48" />
            </div>
          ) : !activeItem ? (
            <div className="flex h-full items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
              Select an item from the queue to start reviewing.
            </div>
          ) : (
            <div className="flex h-full flex-col gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <span>{activeItem.subject ?? "(no subject)"}</span>
                    {activeItem.topLabel && (
                      <Badge className={`${LABEL_COLORS[activeItem.topLabel] ?? "bg-slate-500"}`}>
                        {LABEL_DISPLAY[activeItem.topLabel] ?? activeItem.topLabel}
                      </Badge>
                    )}
                    <Badge variant="outline">
                      {formatPercent(activeItem.topConf)}
                    </Badge>
                  </CardTitle>
                  <CardDescription>
                    Message {activeItem.message_id} &middot; Thread {activeItem.thread_id}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <DistributionBar scores={activeItem.scores} />
                  <ScoreChips scores={activeItem.scores} />
                  <div className="rounded-md border bg-muted/40 p-4 text-sm">
                    <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Snippet</div>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">
                      {activeItem.snippet || "No preview available."}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Label</CardTitle>
                  <CardDescription>Use hotkeys (1-7, 0) or click below</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {LABEL_ORDER.map((label, index) => {
                      const shortcut = index === LABEL_ORDER.length - 1 ? 0 : index + 1;
                      return (
                      <Button
                        key={label}
                        variant="outline"
                        onClick={() => applyLabel(label)}
                        className="flex items-center gap-2"
                      >
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded border text-xs">
                            {shortcut}
                        </span>
                        <span>{LABEL_DISPLAY[label]}</span>
                        <small className="text-muted-foreground">
                          {formatPercent(activeItem.scores[label] ?? 0)}
                        </small>
                      </Button>
                      );
                    })}
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Notes (optional)
                    </label>
                    <Textarea
                      ref={notesRef}
                      value={activeNotes}
                      onChange={(event) =>
                        setNotesByQueue((prev) => ({ ...prev, [activeItem.id]: event.target.value }))
                      }
                      placeholder="Add reviewer context…"
                      className="h-24 resize-none"
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <Button variant="secondary" onClick={skipActive}>
                      Skip (S)
                    </Button>
                    <div className="text-xs text-muted-foreground">
                      Queue ID: {activeItem.id}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DistributionBar({ scores }: { scores: Record<string, number> }) {
  const entries = useMemo(() => {
    const pairs = LABEL_ORDER.map((label) => ({
      label,
      value: scores[label] ?? 0,
    })).filter((entry) => entry.value > 0.001);
    const total = pairs.reduce((sum, entry) => sum + entry.value, 0);
    return total > 0
      ? pairs.map((entry) => ({ ...entry, value: entry.value / total }))
      : pairs;
  }, [scores]);

  if (!entries.length) {
    return (
      <div className="h-2 w-full rounded bg-muted" />
    );
  }

  return (
    <div className="flex h-3 w-full overflow-hidden rounded bg-muted">
      {entries.map((entry) => (
        <div
          key={entry.label}
          className={`${LABEL_COLORS[entry.label] ?? "bg-slate-500"}`}
          style={{ width: `${entry.value * 100}%` }}
          title={`${LABEL_DISPLAY[entry.label] ?? entry.label}: ${formatPercent(entry.value)}`}
        />
      ))}
    </div>
  );
}

function ScoreChips({ scores }: { scores: Record<string, number> }) {
  const sorted = useMemo(() => {
    return [...LABEL_ORDER]
      .map((label) => ({ label, value: scores[label] ?? 0 }))
      .sort((a, b) => b.value - a.value);
  }, [scores]);

  return (
    <div className="flex flex-wrap gap-2">
      {sorted.map((entry) => (
        <Badge
          key={entry.label}
          variant="outline"
          className="flex items-center gap-1 rounded-full px-3 py-1 text-xs"
        >
          <span className={`inline-block h-2 w-2 rounded-full ${LABEL_COLORS[entry.label] ?? "bg-slate-500"}`} />
          <span>{LABEL_DISPLAY[entry.label] ?? entry.label}</span>
          <span className="text-muted-foreground">{formatPercent(entry.value)}</span>
        </Badge>
      ))}
    </div>
  );
}

