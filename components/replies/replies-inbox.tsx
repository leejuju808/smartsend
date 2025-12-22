"use client";

import * as React from "react";
import {
  listReplies,
  type ReplyInboxItem,
} from "@/app/api/replies/list/actions";
import { listCampaignsMin, type CampaignMin } from "@/app/api/campaigns/list-min/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  Loader2,
  Filter,
  MailOpen,
  CheckCircle2,
  XCircle,
  Search,
} from "lucide-react";
import { ReplyDetailDrawer } from "@/components/replies/reply-detail-drawer";
import { IntentBadge } from "@/components/replies/intent-badge";

type ViewFilter = "all" | "needs_action" | "meetings" | "unsubscribe" | "bounces" | "intent_filter";
type IntentFilter = "meeting_intent" | "interested" | "not_interested" | "referral" | "question" | "out_of_office" | "unsubscribe" | "other" | null;

interface RepliesInboxProps {
  accountId: string;
}

function kindBadge(reply: ReplyInboxItem) {
  switch (reply.reply_kind) {
    case "positive_meeting":
      return <Badge className="bg-emerald-500/15 text-emerald-600">Meeting</Badge>;
    case "positive_no_meeting":
      return <Badge className="bg-green-500/15 text-green-600">Positive</Badge>;
    case "neutral_question":
      return <Badge className="bg-blue-500/15 text-blue-600">Question</Badge>;
    case "ooh":
      return <Badge className="bg-amber-500/15 text-amber-600">OOTO</Badge>;
    case "unsubscribe":
      return <Badge className="bg-red-500/15 text-red-600">Unsubscribe</Badge>;
    case "bounce":
      return <Badge className="bg-slate-500/15 text-slate-600">Bounce</Badge>;
    default:
      return <Badge variant="outline">Other</Badge>;
  }
}

function viewFilterLabel(view: ViewFilter) {
  switch (view) {
    case "all":
      return "All";
    case "needs_action":
      return "Needs action";
    case "meetings":
      return "Meetings";
    case "unsubscribe":
      return "Unsubscribes";
    case "bounces":
      return "Bounces";
  }
}

export function RepliesInbox({ accountId }: RepliesInboxProps) {
  const [replies, setReplies] = React.useState<ReplyInboxItem[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [view, setView] = React.useState<ViewFilter>("needs_action");
  const [intentFilter, setIntentFilter] = React.useState<IntentFilter>(null);

  const [campaigns, setCampaigns] = React.useState<CampaignMin[]>([]);
  const [campaignLoading, setCampaignLoading] = React.useState(false);
  const [campaignFilter, setCampaignFilter] = React.useState<string | null>(null);

  const [tags, setTags] = React.useState<{ id: string; name: string }[]>([]);
  const [tagsLoading, setTagsLoading] = React.useState(false);
  const [tagFilter, setTagFilter] = React.useState<string | null>(null);

  const [search, setSearch] = React.useState("");
  const [searchInput, setSearchInput] = React.useState("");

  const [selectedReplyId, setSelectedReplyId] = React.useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  async function refresh(opts?: { keepLoading?: boolean }) {
    if (!opts?.keepLoading) setLoading(true);
    try {
      const data = await listReplies(accountId, {
        campaignId: campaignFilter,
        search: search,
        tagId: tagFilter,
      });
      setReplies(data);
    } catch (err) {
      console.error(err);
    } finally {
      if (!opts?.keepLoading) setLoading(false);
    }
  }

  React.useEffect(() => {
    let mounted = true;

    async function loadInitial() {
      setLoading(true);
      setTagsLoading(true);
      try {
        // Get workspace_id from account (assuming accountId is workspace_id or we need to fetch it)
        // For now, using accountId as workspace_id - adjust if needed
        const [repliesData, campaignsData, tagsRes] = await Promise.all([
          listReplies(accountId),
          listCampaignsMin(accountId),
          fetch(`/api/tags?workspace_id=${accountId}`).then(r => r.json()).catch(() => ({ tags: [] })),
        ]);
        if (!mounted) return;
        setReplies(repliesData);
        setCampaigns(campaignsData);
        setTags(tagsRes.tags || []);
      } catch (err) {
        console.error(err);
      } finally {
        if (mounted) {
          setLoading(false);
          setCampaignLoading(false);
          setTagsLoading(false);
        }
      }
    }

    setCampaignLoading(true);
    loadInitial();

    return () => {
      mounted = false;
    };
  }, [accountId]);

  // Re-run when campaignFilter, tagFilter, or search changes
  React.useEffect(() => {
    // debounce search a bit
    const handle = setTimeout(() => {
      refresh({ keepLoading: false });
    }, 300);

    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignFilter, tagFilter, search]);

  const filtered = React.useMemo(() => {
    let result = replies;

    // Apply intent filter first if set
    if (intentFilter !== null) {
      result = result.filter((r) => {
        // Map reply_kind to intent_primary if available
        const threadIntent = (r as any).intent_primary;
        if (threadIntent) {
          return threadIntent === intentFilter;
        }
        // Fallback mapping for existing reply_kind values
        if (intentFilter === "meeting_intent" && r.has_meeting_intent) return true;
        if (intentFilter === "interested" && r.reply_kind === "positive_no_meeting") return true;
        if (intentFilter === "not_interested" && r.reply_kind === "negative") return true;
        if (intentFilter === "question" && r.reply_kind === "neutral_question") return true;
        if (intentFilter === "out_of_office" && r.reply_kind === "ooh") return true;
        if (intentFilter === "unsubscribe" && r.is_unsubscribe) return true;
        return false;
      });
    }

    if (view === "all") return result;

    if (view === "meetings") {
      return result.filter((r) => r.has_meeting_intent);
    }

    if (view === "unsubscribe") {
      return result.filter((r) => r.is_unsubscribe);
    }

    if (view === "bounces") {
      return result.filter((r) => r.is_bounce);
    }

    // needs_action
    return result.filter((r) => {
      if (r.has_meeting_intent) return true;
      if (
        (r.reply_kind === "neutral_question" ||
          r.reply_kind === "positive_no_meeting") &&
        !r.is_unsubscribe &&
        !r.is_bounce
      ) {
        return true;
      }
      return false;
    });
  }, [replies, view, intentFilter]);

  function openReply(id: string) {
    setSelectedReplyId(id);
    setDrawerOpen(true);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <MailOpen className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-base font-semibold">Replies Inbox</h1>
            <p className="text-xs text-muted-foreground">
              AI-sorted replies from your SmartSend campaigns.
            </p>
          </div>
        </div>

        {/* View filters */}
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          {(["needs_action", "all", "meetings", "unsubscribe", "bounces"] as ViewFilter[]).map(
            (v) => (
              <Button
                key={v}
                type="button"
                size="sm"
                variant={v === view ? "default" : "outline"}
                className={cn(
                  "text-xs",
                  v === view && "bg-primary text-primary-foreground"
                )}
                onClick={() => {
                  setView(v);
                  setIntentFilter(null);
                }}
              >
                {viewFilterLabel(v)}
              </Button>
            )
          )}
        </div>
        
        {/* Intent filters */}
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <span className="text-xs text-muted-foreground">Intent:</span>
          {[
            { value: null, label: "All" },
            { value: "meeting_intent" as const, label: "Meeting Intent" },
            { value: "interested" as const, label: "Interested" },
            { value: "not_interested" as const, label: "Not Interested" },
            { value: "referral" as const, label: "Referral" },
            { value: "question" as const, label: "Question" },
            { value: "out_of_office" as const, label: "OOO" },
            { value: "unsubscribe" as const, label: "Unsubscribe" },
            { value: "other" as const, label: "Other" },
          ].map(({ value, label }) => (
            <Button
              key={value || "all"}
              type="button"
              size="sm"
              variant={intentFilter === value ? "default" : "outline"}
              className={cn(
                "text-xs",
                intentFilter === value && "bg-primary text-primary-foreground"
              )}
              onClick={() => {
                setIntentFilter(value);
                setView("all");
              }}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      {/* Filters: campaign + search */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card px-3 py-2">
        {/* Campaign filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Campaign</span>
          <Select
            value={campaignFilter ?? "___ALL"}
            onValueChange={(val) => {
              if (val === "___ALL") setCampaignFilter(null);
              else setCampaignFilter(val);
            }}
            disabled={campaignLoading}
          >
            <SelectTrigger className="h-8 w-[220px] text-xs">
              <SelectValue placeholder="All campaigns" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="___ALL">All campaigns</SelectItem>
              {campaigns.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Tag filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Tag</span>
          <Select
            value={tagFilter ?? "___ALL"}
            onValueChange={(val) => {
              if (val === "___ALL") setTagFilter(null);
              else setTagFilter(val);
            }}
            disabled={tagsLoading}
          >
            <SelectTrigger className="h-8 w-[160px] text-xs">
              <SelectValue placeholder="All tags" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="___ALL">All tags</SelectItem>
              {tags.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Search */}
        <div className="flex items-center gap-2">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <div className="relative">
            <Input
              className="h-8 w-[220px] pr-6 text-xs"
              placeholder="Search email, subject, or text…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  setSearch(searchInput);
                }
              }}
              onBlur={() => {
                // optional: sync on blur
                setSearch(searchInput);
              }}
            />
            {search && (
              <button
                type="button"
                className="absolute inset-y-0 right-1 flex items-center text-[10px] text-muted-foreground"
                onClick={() => {
                  setSearch("");
                  setSearchInput("");
                }}
              >
                ×
              </button>
            )}
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {loading && (
            <span className="inline-flex items-center text-[11px] text-muted-foreground">
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              Loading…
            </span>
          )}
        </div>
      </div>

      {/* Stats strip */}
      <div className="grid gap-2 sm:grid-cols-4">
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <MailOpen className="h-3 w-3" /> Total replies
          </p>
          <p className="mt-1 text-lg font-semibold">{replies.length}</p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3 text-emerald-500" /> Meetings
          </p>
          <p className="mt-1 text-lg font-semibold">
            {replies.filter((r) => r.has_meeting_intent).length}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <XCircle className="h-3 w-3 text-red-500" /> Unsubscribes
          </p>
          <p className="mt-1 text-lg font-semibold">
            {replies.filter((r) => r.is_unsubscribe).length}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <XCircle className="h-3 w-3 text-slate-500" /> Bounces
          </p>
          <p className="mt-1 text-lg font-semibold">
            {replies.filter((r) => r.is_bounce).length}
          </p>
        </div>
      </div>

      {/* List */}
      <div className="rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-xs text-muted-foreground">
            Showing <span className="font-semibold">{filtered.length}</span>{" "}
            {viewFilterLabel(view).toLowerCase()} replies (latest first).
          </p>
        </div>

        {filtered.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs text-muted-foreground">
            No replies in this view yet.
          </div>
        ) : (
          <div className="max-h-[540px] overflow-auto">
            <table className="min-w-full text-xs">
              <thead className="sticky top-0 z-10 bg-muted">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">From</th>
                  <th className="px-3 py-2 text-left font-semibold">Subject / Label</th>
                  <th className="px-3 py-2 text-left font-semibold">AI</th>
                  <th className="px-3 py-2 text-left font-semibold w-[40%]">
                    Snippet
                  </th>
                  <th className="px-3 py-2 text-left font-semibold">When</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr
                    key={r.id}
                    className="border-t cursor-pointer hover:bg-muted/40"
                    onClick={() => openReply(r.id)}
                  >
                    <td className="px-3 py-2 align-top">
                      <div className="flex flex-col">
                        <span className="font-medium truncate max-w-[180px]">
                          {r.from_email || "Unknown"}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          → {r.to_email || "—"}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="flex flex-col gap-1">
                        <span className="truncate max-w-[220px]">
                          {r.subject || "(no subject)"}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {r.ai_label || "Unlabeled"}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <div className="flex flex-col gap-1">
                        {(r as any).intent_primary ? (
                          <IntentBadge intent={(r as any).intent_primary} />
                        ) : (
                          kindBadge(r)
                        )}
                        {typeof r.ai_score === "number" && (
                          <span className="text-[10px] text-muted-foreground">
                            {(r.ai_score * 100).toFixed(0)}% confident
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <p className="line-clamp-3 max-w-[360px] text-[11px] text-muted-foreground whitespace-pre-wrap">
                        {r.raw_text?.trim() || "—"}
                      </p>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <span className="text-[11px] text-muted-foreground">
                        {new Date(r.created_at).toLocaleString()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ReplyDetailDrawer
        replyId={selectedReplyId}
        open={drawerOpen}
        onOpenChange={(open) => {
          setDrawerOpen(open);
        }}
        onUpdated={() => refresh()}
      />
    </div>
  );
}

