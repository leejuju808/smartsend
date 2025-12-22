"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TBody, TD, THead, TH, TR } from "@/components/ui/table";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/use-toast";
import { RepliesSavedViews } from "../RepliesHeaderSavedViews";
import { HotLeadsList } from "../views/HotLeadsList";
import { ToneLabeler, type Tone } from "@/app/(dashboard)/replies/[replyId]/ToneLabeler";

const LABELS = ["positive", "question", "out_of_office", "unsubscribe", "neutral", "negative"] as const;
const DATE_FILTERS = [
  { key: "all", label: "Any time", days: null },
  { key: "1d", label: "Last 24h", days: 1 },
  { key: "7d", label: "Last 7d", days: 7 },
  { key: "30d", label: "Last 30d", days: 30 },
] as const;

type LabelKey = (typeof LABELS)[number];

type ReplyRow = {
  id: string;
  from_email: string;
  to_email: string;
  subject: string | null;
  snippet: string | null;
  text_body: string | null;
  html_body: string | null;
  headers: Record<string, unknown>;
  received_at: string;
  lead_id: string | null;
  campaign_id: string | null;
  lead: {
    id: string;
    full_name: string | null;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | null;
  campaign: {
    id: string;
    name: string | null;
  } | null;
  reply_classifications: {
    label: string;
    confidence: number;
  } | null;
  tone_label?: string | null;
};

type Props = {
  rows: ReplyRow[];
  hotLeadsViewId?: string | null;
};

type ActionState =
  | { type: "mark"; id: string }
  | { type: "unsubscribe"; id: string }
  | { type: "reclassify"; id: string }
  | null;

export default function RepliesClient({ rows, hotLeadsViewId }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [labelFilter, setLabelFilter] = useState<LabelKey | "all">("all");
  const [campaignFilter, setCampaignFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<(typeof DATE_FILTERS)[number]["key"]>("all");
  const [activeReply, setActiveReply] = useState<ReplyRow | null>(null);
  const [actionState, setActionState] = useState<ActionState>(null);
  const [isPending, startTransition] = useTransition();

  const campaigns = useMemo(() => {
    const seen = new Map<string, string>();
    rows.forEach((row) => {
      if (row.campaign && row.campaign.id) {
        seen.set(row.campaign.id, row.campaign.name ?? "Untitled campaign");
      }
    });
    return Array.from(seen.entries());
  }, [rows]);

  const filtered = useMemo(() => {
    const now = Date.now();
    const limitDays = DATE_FILTERS.find((f) => f.key === dateFilter)?.days;
    const cutoff = limitDays ? now - limitDays * 24 * 60 * 60 * 1000 : null;

    return rows.filter((row) => {
      if (labelFilter !== "all") {
        if (!row.reply_classifications || row.reply_classifications.label !== labelFilter) {
          return false;
        }
      }

      if (campaignFilter !== "all") {
        if (!row.campaign || row.campaign.id !== campaignFilter) {
          return false;
        }
      }

      if (cutoff) {
        const received = new Date(row.received_at).getTime();
        if (Number.isFinite(received) && received < cutoff) {
          return false;
        }
      }

      if (search.trim()) {
        const needle = search.toLowerCase();
        const haystacks = [
          row.subject ?? "",
          row.snippet ?? "",
          row.from_email ?? "",
          row.to_email ?? "",
          row.lead?.full_name ?? "",
          row.lead?.email ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!haystacks.includes(needle)) {
          return false;
        }
      }

      return true;
    });
  }, [rows, labelFilter, campaignFilter, dateFilter, search]);

  const handleMarkReplied = async (reply: ReplyRow) => {
    setActionState({ type: "mark", id: reply.id });
    try {
      const res = await fetch(`/api/replies/mark-replied/${reply.id}`, { method: "POST" });
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.error ?? "Failed to mark as replied");
      }
      toast({ title: "Marked as replied" });
      startTransition(() => router.refresh());
    } catch (error) {
      console.error(error);
      toast({
        title: "Failed to mark as replied",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setActionState(null);
    }
  };

  const handleUnsubscribe = async (reply: ReplyRow) => {
    setActionState({ type: "unsubscribe", id: reply.id });
    try {
      const res = await fetch(`/api/replies/unsubscribe/${reply.id}`, { method: "POST" });
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.error ?? "Failed to unsubscribe");
      }
      toast({ title: "Contact unsubscribed" });
      startTransition(() => router.refresh());
    } catch (error) {
      console.error(error);
      toast({
        title: "Failed to unsubscribe",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setActionState(null);
    }
  };

  const handleReclassify = async (reply: ReplyRow) => {
    setActionState({ type: "reclassify", id: reply.id });
    try {
      const res = await fetch(`/api/replies/reclassify/${reply.id}`, { method: "POST" });
      if (!res.ok) {
        const detail = await res.json().catch(() => null);
        throw new Error(detail?.error ?? "Failed to reclassify");
      }
      toast({ title: "Reclassification queued" });
      startTransition(() => router.refresh());
    } catch (error) {
      console.error(error);
      toast({
        title: "Reclassify failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setActionState(null);
    }
  };

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Replies Inbox</h1>
          <p className="text-sm text-muted-foreground">
            Unified view of inbound replies from Gmail and Outlook.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {LABELS.map((label) => {
            const isActive = labelFilter === label;
            return (
              <Button
                key={label}
                variant={isActive ? "default" : "outline"}
                size="sm"
                onClick={() => setLabelFilter(isActive ? "all" : label)}
              >
                {label.replace(/_/g, " ")}
                {countsForLabel(rows, label) > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {countsForLabel(rows, label)}
                  </Badge>
                )}
              </Button>
            );
          })}
        </div>
      </div>

      <Card className="space-y-4 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Saved Views</h2>
            <p className="text-xs text-muted-foreground">
              Run shared filters to spotlight ICP fit and recent intent.
            </p>
          </div>
          <RepliesSavedViews scope="inbox" />
        </div>
        {hotLeadsViewId && (
          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Hot Leads (last 7 days)
            </div>
            <HotLeadsList viewId={hotLeadsViewId} />
          </div>
        )}
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex flex-col gap-3 md:flex-row">
          <Input
            placeholder="Search subject, snippet, email…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="md:max-w-xs"
          />
          <Select value={campaignFilter} onValueChange={setCampaignFilter}>
            <SelectTrigger className="md:w-[200px]">
              <SelectValue placeholder="All campaigns" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All campaigns</SelectItem>
              {campaigns.map(([id, name]) => (
                <SelectItem key={id} value={id}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={dateFilter} onValueChange={(value) => setDateFilter(value as typeof dateFilter)}>
            <SelectTrigger className="md:w-[180px]">
              <SelectValue placeholder="Any time" />
            </SelectTrigger>
            <SelectContent>
              {DATE_FILTERS.map((f) => (
                <SelectItem key={f.key} value={f.key}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={() => {
              setSearch("");
              setLabelFilter("all");
              setCampaignFilter("all");
              setDateFilter("all");
            }}
          >
            Reset
          </Button>
        </div>
        <div className="text-xs text-muted-foreground">
          Showing {filtered.length} of {rows.length} most recent replies.
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="max-h-[70vh] overflow-y-auto">
          <Table>
            <THead>
              <TR>
                <TH>From</TH>
                <TH>Subject & Snippet</TH>
                <TH>Label</TH>
                <TH>Received</TH>
                <TH>Lead</TH>
                <TH>Campaign</TH>
              </TR>
            </THead>
            <TBody>
              {filtered.length === 0 ? (
                <TR>
                  <TD colSpan={6} className="text-center text-sm text-muted-foreground">
                    No replies match your filters.
                  </TD>
                </TR>
              ) : (
                filtered.map((reply) => (
                  <TR
                    key={reply.id}
                    className="hover:bg-muted/60 cursor-pointer"
                    onClick={() => setActiveReply(reply)}
                  >
                    <TD>
                      <div className="font-medium">{reply.from_email}</div>
                      <div className="text-xs text-muted-foreground">{reply.to_email}</div>
                    </TD>
                    <TD>
                      <div className="font-medium truncate max-w-[260px]">
                        {reply.subject || "(no subject)"}
                      </div>
                      <div className="text-xs text-muted-foreground truncate max-w-[320px]">
                        {reply.snippet || reply.text_body?.slice(0, 140) || ""}
                      </div>
                    </TD>
                    <TD>
                      {reply.reply_classifications?.label ? (
                        <Badge variant="outline" className="capitalize">
                          {reply.reply_classifications.label.replace(/_/g, " ")}
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Unclassified</Badge>
                      )}
                    </TD>
                    <TD>
                      <div className="text-sm">
                        {new Date(reply.received_at).toLocaleString()}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(reply.received_at), { addSuffix: true })}
                      </div>
                    </TD>
                    <TD>
                      {reply.lead ? (
                        <div className="space-y-1">
                          <div className="font-medium text-sm">
                            {reply.lead.full_name ||
                              [reply.lead.first_name, reply.lead.last_name].filter(Boolean).join(" ") ||
                              reply.lead.email ||
                              "Lead"}
                          </div>
                          {reply.lead.email && (
                            <div className="text-xs text-muted-foreground">{reply.lead.email}</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Unlinked</span>
                      )}
                    </TD>
                    <TD>
                      {reply.campaign ? (
                        <div className="space-y-1">
                          <div className="text-sm font-medium">
                            {reply.campaign.name ?? "Campaign"}
                          </div>
                          <div className="text-xs text-muted-foreground">{reply.campaign.id}</div>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        </div>
      </Card>

      <ActionDrawer
        reply={activeReply}
        onClose={() => setActiveReply(null)}
        onMarkReplied={handleMarkReplied}
        onUnsubscribe={handleUnsubscribe}
        onReclassify={handleReclassify}
        isPending={isPending}
        actionState={actionState}
      />
    </div>
  );
}

function countsForLabel(rows: ReplyRow[], label: string) {
  return rows.filter((row) => row.reply_classifications?.label === label).length;
}

type DrawerProps = {
  reply: ReplyRow | null;
  onClose: () => void;
  onMarkReplied: (reply: ReplyRow) => void | Promise<void>;
  onUnsubscribe: (reply: ReplyRow) => void | Promise<void>;
  onReclassify: (reply: ReplyRow) => void | Promise<void>;
  isPending: boolean;
  actionState: ActionState;
};

function ActionDrawer({
  reply,
  onClose,
  onMarkReplied,
  onUnsubscribe,
  onReclassify,
  isPending,
  actionState,
}: DrawerProps) {
  const router = useRouter();
  const open = !!reply;
  const [tone, setTone] = useState<Tone | null>((reply?.tone_label as Tone | null) ?? null);

  useEffect(() => {
    setTone((reply?.tone_label as Tone | null) ?? null);
  }, [reply?.id, reply?.tone_label]);

  return (
    <Sheet open={open} onOpenChange={(value) => !value && onClose()}>
      <SheetContent>
        {reply && (
          <>
            <SheetHeader>
              <SheetTitle className="flex flex-col gap-2">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">Subject</span>
                <span>{reply.subject || "(no subject)"}</span>
                <div className="flex flex-wrap gap-2 pt-2">
                  <Badge variant="outline">{reply.from_email}</Badge>
                  <Badge variant="outline">{reply.to_email}</Badge>
                  {reply.reply_classifications?.label && (
                    <Badge variant="secondary" className="capitalize">
                      {reply.reply_classifications.label.replace(/_/g, " ")}
                    </Badge>
                  )}
                </div>
                <ToneLabeler replyId={reply.id} initialTone={tone} onToneChange={setTone} />
              </SheetTitle>
            </SheetHeader>

            <div className="space-y-6 px-6 pb-6">
              <section>
                <h3 className="text-sm font-semibold mb-2">Received</h3>
                <p className="text-sm">
                  {new Date(reply.received_at).toLocaleString()} •{" "}
                  {formatDistanceToNow(new Date(reply.received_at), { addSuffix: true })}
                </p>
              </section>

              <section>
                <h3 className="text-sm font-semibold mb-2">Headers</h3>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(reply.headers ?? {})
                    .slice(0, 12)
                    .map(([key, value]) => (
                      <Badge key={key} variant="outline" className="text-xs font-normal">
                        <span className="font-semibold">{key}:</span>{" "}
                        <span>{String(value).slice(0, 80)}</span>
                      </Badge>
                    ))}
                  {Object.keys(reply.headers ?? {}).length === 0 && (
                    <span className="text-xs text-muted-foreground">No headers captured.</span>
                  )}
                </div>
              </section>

              <section className="space-y-3">
                <h3 className="text-sm font-semibold">Plain Text</h3>
                <div className="rounded border bg-muted/40 p-4 text-sm whitespace-pre-wrap">
                  {reply.text_body || "—"}
                </div>
                <h3 className="text-sm font-semibold">HTML Body</h3>
                <div className="rounded border bg-muted/20 p-4 text-sm prose prose-sm max-w-none">
                  {reply.html_body ? (
                    <div dangerouslySetInnerHTML={{ __html: reply.html_body }} />
                  ) : (
                    "—"
                  )}
                </div>
              </section>
            </div>

            <SheetFooter>
              <div className="flex flex-col gap-2">
                <div className="grid gap-2 md:grid-cols-2">
                  <Button
                    variant="default"
                    onClick={() => onMarkReplied(reply)}
                    disabled={
                      actionState?.type === "mark" && actionState.id === reply.id
                    }
                  >
                    {actionState?.type === "mark" && actionState.id === reply.id ? "Marking…" : "Mark as Replied"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => onUnsubscribe(reply)}
                    disabled={
                      actionState?.type === "unsubscribe" && actionState.id === reply.id
                    }
                  >
                    {actionState?.type === "unsubscribe" && actionState.id === reply.id ? "Unsubscribing…" : "Unsubscribe"}
                  </Button>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <Button
                    variant="outline"
                    disabled={!reply.lead_id || isPending}
                    onClick={() => {
                      if (!reply.lead_id) return;
                      router.push(`/crm/lead/${reply.lead_id}`);
                      onClose();
                    }}
                  >
                    Route to Owner
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => onReclassify(reply)}
                    disabled={
                      actionState?.type === "reclassify" && actionState.id === reply.id
                    }
                  >
                    {actionState?.type === "reclassify" && actionState.id === reply.id ? "Reclassifying…" : "Reclassify"}
                  </Button>
                </div>
              </div>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

