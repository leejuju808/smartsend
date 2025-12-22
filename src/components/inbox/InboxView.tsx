"use client";

import * as React from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { NudgeBanner } from "@/components/thread/NudgeBanner";
import { ApproveFirstDraft } from "@/components/thread/ApproveFirstDraft";
import { SmartFollowupPreview } from "@/components/thread/SmartFollowupPreview";
import { MessageBody } from "@/components/inbox/MessageBody";
import { LabelChip } from "@/components/inbox/LabelChip";
import { LeadActionsBar } from "@/components/inbox/LeadActionsBar";

type ThreadItem = {
  thread_id: string;
  campaign_id: string | null;
  lead_id: string | null;
  needs_reply: boolean;
  last_in_at: string | null;
  last_inbound_ai_label: string | null;
  last_inbound_ai_score: number | null;
  last_human_out_at: string | null;
  subject: string;
  snippet: string;
  from_email?: string | null;
  from_name?: string | null;
  updated_at: string | null;
  replied_at: string | null;
};

type MessagesResponse = {
  messages: Array<{
    id: string;
    direction: "inbound" | "outbound";
    subject: string | null;
    body_text: string | null;
    body_html: string | null;
    created_at: string;
    from_email: string | null;
    from_name: string | null;
    meta: Record<string, unknown> | null;
    provider: string | null;
    provider_message_id: string | null;
    account_id: string | null;
    ai_label: string | null;
    ai_confidence: number | null;
  }>;
};

type ThreadsResponse = {
  threads: ThreadItem[];
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function InboxView({ initialCampaignId }: { initialCampaignId?: string }) {
  const [tab, setTab] = React.useState<"all" | "needs" | "recent">("all");
  const [label, setLabel] = React.useState<string>("");
  const searchParams = useSearchParams();
  const campaignFromUrl = searchParams.get("campaign_id") ?? "";
  const [campaignId, setCampaignId] = React.useState<string>(
    initialCampaignId ?? campaignFromUrl
  );
  const [q, setQ] = React.useState<string>("");
  const [selected, setSelected] = React.useState<ThreadItem | null>(null);

  React.useEffect(() => {
    setCampaignId(campaignFromUrl);
  }, [campaignFromUrl]);

  const url = React.useMemo(() => {
    const params = new URLSearchParams({ tab });
    if (label) params.set("label", label);
    if (campaignId) params.set("campaign_id", campaignId);
    if (q) params.set("q", q);
    return `/api/inbox/threads?${params.toString()}`;
  }, [tab, label, campaignId, q]);

  const { data, isLoading, mutate } = useSWR<ThreadsResponse>(url, fetcher, {
    refreshInterval: 5000,
  });

  const { data: needsReplyData } = useSWR<{ count: number }>(
    "/api/inbox/needs-reply/count",
    fetcher,
    { refreshInterval: 10000 }
  );

  const needsReplyCount = needsReplyData?.count ?? 0;

  const threads = data?.threads ?? [];

  React.useEffect(() => {
    if (!threads.length) {
      setSelected(null);
      return;
    }

    setSelected((current) => {
      if (!current) return threads[0];
      const match = threads.find((t) => t.thread_id === current.thread_id);
      return match ?? threads[0];
    });
  }, [threads]);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Button
            variant={tab === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setTab("all")}
          >
            All
          </Button>
          <Button
            variant={tab === "needs" ? "default" : "outline"}
            size="sm"
            onClick={() => setTab("needs")}
            className="flex items-center gap-2"
          >
            Needs Reply
            <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
              {needsReplyCount}
            </span>
          </Button>
          <Button
            variant={tab === "recent" ? "default" : "outline"}
            size="sm"
            onClick={() => setTab("recent")}
          >
            Recently Replied
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          <Input
            placeholder="Search"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            className="max-w-xs"
          />
          <Input
            placeholder="Campaign ID"
            value={campaignId}
            onChange={(event) => setCampaignId(event.target.value)}
            className="max-w-xs"
          />
          <Button
            variant={label === "" ? "default" : "outline"}
            size="sm"
            onClick={() => setLabel("")}
          >
            All labels
          </Button>
          <Button
            variant={label === "question" ? "default" : "outline"}
            size="sm"
            onClick={() => setLabel("question")}
          >
            question
          </Button>
          <Button
            variant={label === "neutral" ? "default" : "outline"}
            size="sm"
            onClick={() => setLabel("neutral")}
          >
            neutral
          </Button>
        </div>

        <Separator />

        <div className="space-y-2">
          {isLoading && (
            <div className="text-sm text-muted-foreground">Loading…</div>
          )}
          {!isLoading && threads.length === 0 && (
            <div className="text-sm text-muted-foreground">No threads.</div>
          )}
          {threads.map((thread) => {
            const isSelected = selected?.thread_id === thread.thread_id;

            return (
              <Card
                key={thread.thread_id}
                className={`cursor-pointer transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  isSelected ? "ring-1 ring-zinc-700" : ""
                }`}
                tabIndex={0}
                onClick={() => setSelected(thread)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelected(thread);
                  }
                }}
              >
                <CardContent className="space-y-1 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium truncate">
                      {thread.subject || "(no subject)"}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {thread.last_inbound_ai_label ? (
                        <LabelChip label={thread.last_inbound_ai_label} />
                      ) : null}
                      {thread.needs_reply ? <Badge variant="secondary">Needs reply</Badge> : null}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {(thread.from_name || thread.from_email || "") || "Unknown"}
                  </div>
                  <div className="text-xs line-clamp-2">{thread.snippet}</div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <div className="space-y-3 md:col-span-2">
        {!selected ? (
          <div className="text-sm text-muted-foreground">Select a thread</div>
        ) : (
          <ThreadDetail
            key={selected.thread_id}
            thread={selected}
            onResolved={mutate}
          />
        )}
      </div>
    </div>
  );
}

function ThreadDetail({
  thread,
  onResolved,
}: {
  thread: ThreadItem;
  onResolved: () => void;
}) {
  const { data, isLoading, mutate } = useSWR<MessagesResponse>(
    `/api/inbox/threads/${thread.thread_id}/messages`,
    fetcher,
    {
      refreshInterval: 5000,
    }
  );

  // Fetch lead data for LeadActionsBar
  const { data: leadData, mutate: mutateLead } = useSWR<{
    intent?: string;
    status?: string;
  }>(
    thread.lead_id ? `/api/leads/${thread.lead_id}` : null,
    fetcher
  );

  const messages = data?.messages ?? [];

  const refreshThread = React.useCallback(() => {
    mutate();
    mutateLead();
    onResolved();
  }, [mutate, mutateLead, onResolved]);

  const markResolved = React.useCallback(async () => {
    const res = await fetch(`/api/inbox/threads/${thread.thread_id}/resolve`, {
      method: "POST",
    });

    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      toast.error(`Failed: ${payload?.error ?? res.statusText}`);
      return;
    }

    toast.success("Marked as resolved");
    onResolved();
    mutate();
  }, [mutate, onResolved, thread.thread_id]);

  return (
    <div className="space-y-3">
      {thread.lead_id && (
        <LeadActionsBar
          leadId={thread.lead_id}
          currentIntent={(leadData?.intent as any) || "unknown"}
          currentStatus={(leadData?.status as any) || "new"}
          onUpdated={refreshThread}
        />
      )}
      <NudgeBanner threadId={thread.thread_id} />
      <SmartFollowupPreview
        threadId={thread.thread_id}
        campaignId={thread.campaign_id ?? ""}
        leadId={thread.lead_id ?? ""}
      />

      <Card className="border border-zinc-800">
        <CardContent className="space-y-3 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <LabelChip label={thread.last_inbound_ai_label} />
            {thread.needs_reply ? <Badge>Needs reply</Badge> : null}
            <div className="ml-auto flex gap-2">
              <ApproveFirstDraft threadId={thread.thread_id} />
              <Button variant="outline" size="sm" onClick={markResolved}>
                Mark Resolved
              </Button>
            </div>
          </div>

          <Separator />

          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading messages…</div>
          ) : (
            <div className="max-h-[60vh] space-y-3 overflow-auto pr-1">
              {messages.map((message) => {
                const inbound = message.direction === "inbound";
                const timestamp = new Date(message.created_at).toLocaleString();
                const author = inbound
                  ? message.from_name || message.from_email || "Lead"
                  : "You";

                return (
                  <div
                    key={message.id}
                    className={`rounded-lg border border-zinc-800 p-3 ${
                      inbound
                        ? "bg-zinc-950/50"
                        : "ml-8 bg-zinc-900/40"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                      <div className="flex flex-wrap items-center gap-2">
                        <span>{author}</span>
                        <span>•</span>
                        <span>{timestamp}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {message.ai_label ? <LabelChip label={message.ai_label} /> : null}
                        {typeof message.ai_confidence === "number" ? (
                          <span className="text-[10px] text-muted-foreground">
                            {Math.round(message.ai_confidence * 100)}%
                          </span>
                        ) : null}
                      </div>
                    </div>
                    {message.subject ? (
                      <div className="mt-1 text-sm font-medium">
                        {message.subject}
                      </div>
                    ) : null}
                    <MessageBody
                      accountId={message.account_id}
                      provider={message.provider}
                      providerMessageId={message.provider_message_id}
                      fallbackPlain={message.body_text}
                      fallbackHtml={message.body_html}
                    />
                  </div>
                );
              })}
              {messages.length === 0 ? (
                <div className="text-sm text-muted-foreground">No messages yet.</div>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


