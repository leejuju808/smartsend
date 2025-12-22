"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CalendarCheck,
  CalendarClock,
  PhoneCall,
  Search,
} from "lucide-react";
import { MeetingReplyDialog } from "@/components/meetings/MeetingReplyDialog";

type MeetingIntent =
  | "meeting_requested"
  | "meeting_confirmed"
  | "followup_needed";

type ReplyMeetingItem = {
  id: string;
  workspace_id: string;
  lead_id: string | null;
  campaign_id: string | null;
  from_email: string | null;
  subject: string | null;
  body_plain: string | null;
  received_at: string;
  ai_label: string | null;
  ai_intent_summary: string | null;
  ai_meeting_intent: MeetingIntent;
  ai_confidence: number | null;
  leads?: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    company: string | null;
  } | null;
  campaigns?: {
    id: string;
    name: string | null;
  } | null;
};

type IntentFilter = "all" | "meeting_requested" | "meeting_confirmed" | "followup_needed";

function intentBadge(intent: MeetingIntent) {
  const common =
    "inline-flex items-center gap-1 rounded-full px-2 py-[2px] text-[10px]";
  switch (intent) {
    case "meeting_confirmed":
      return (
        <span
          className={`${common} bg-emerald-900/80 border border-emerald-700 text-emerald-100`}
        >
          <CalendarCheck className="h-3 w-3" />
          Meeting confirmed
        </span>
      );
    case "meeting_requested":
      return (
        <span
          className={`${common} bg-blue-900/80 border border-blue-700 text-blue-100`}
        >
          <PhoneCall className="h-3 w-3" />
          Meeting requested
        </span>
      );
    case "followup_needed":
      return (
        <span
          className={`${common} bg-amber-900/80 border border-amber-700 text-amber-100`}
        >
          <CalendarClock className="h-3 w-3" />
          Follow-up needed
        </span>
      );
    default:
      return null;
  }
}

export default function MeetingIntentsPage() {
  const [items, setItems] = useState<ReplyMeetingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [intentFilter, setIntentFilter] = useState<IntentFilter>("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const loadItems = async (opts?: {
    intent?: IntentFilter;
    q?: string;
  }) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      const i = opts?.intent ?? intentFilter;
      if (i && i !== "all") {
        params.set("intent", i);
      }
      if (opts?.q && opts.q.trim().length > 0) {
        params.set("q", opts.q.trim());
      }

      const res = await fetch(`/api/meeting-intents?${params.toString()}`);
      const json = await res.json();

      if (!res.ok) {
        console.error("meeting-intents error", json);
        setItems([]);
        return;
      }

      setItems(json.items || []);
    } catch (err) {
      console.error("meeting-intents exception", err);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems({ intent: intentFilter, q: search });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intentFilter, search]);

  const counts = items.reduce(
    (acc, item) => {
      acc.all++;
      acc[item.ai_meeting_intent]++;
      return acc;
    },
    {
      all: 0,
      meeting_requested: 0,
      meeting_confirmed: 0,
      followup_needed: 0,
    } as Record<IntentFilter, number>
  );

  return (
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
          <h1 className="text-2xl font-bold">Meeting Intent Inbox</h1>
            <p className="text-xs text-muted-foreground">
            Leads whose replies mention booking or confirming a call, extracted
            by AI from your reply stream.
          </p>
        </div>
        <Badge className="bg-slate-900 border-slate-700 text-[10px]">
          Meeting intent v1
        </Badge>
      </div>

      {/* Filters row */}
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <div className="inline-flex items-center gap-1 rounded-full bg-slate-950/80 border border-slate-800 px-1 py-[1px]">
          {(
            [
              ["all", "All"],
              ["meeting_requested", "Requests"],
              ["meeting_confirmed", "Confirmed"],
              ["followup_needed", "Follow-ups"],
            ] as [IntentFilter, string][]
          ).map(([key, label]) => {
            const isActive = intentFilter === key;
            const count = counts[key] ?? 0;
            return (
              <button
                key={key}
                onClick={() => setIntentFilter(key)}
                className={`flex items-center gap-1 rounded-full px-2 py-[2px] ${
                  isActive
                    ? "bg-slate-800 text-slate-50"
                    : "text-slate-300 hover:bg-slate-900/80"
                }`}
              >
                <span>{label}</span>
                <span className="text-[9px] text-slate-400">
                  ({count})
                </span>
              </button>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-1">
          <div className="relative">
            <Search className="absolute left-2 top-1.5 h-3.5 w-3.5 text-slate-500" />
            <Input
              className="h-7 pl-7 pr-2 text-[11px] w-56"
              placeholder="Search lead, company, subject…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setSearch(searchInput);
                }
              }}
            />
          </div>
            <Button
              size="sm"
              variant="outline"
            className="h-7 px-2 text-[10px]"
            onClick={() => setSearch(searchInput)}
          >
            Apply
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[10px]"
            onClick={() => {
              setSearchInput("");
              setSearch("");
            }}
          >
            Clear
            </Button>
            <Button
              size="sm"
              variant="outline"
            className="h-7 px-2 text-[10px]"
            onClick={() => loadItems({ intent: intentFilter, q: search })}
            >
            Refresh
            </Button>
          </div>
        </div>

          <Card className="bg-slate-950/80 border-slate-800">
            <CardContent className="p-3">
          {loading ? (
            <div className="text-xs text-muted-foreground py-4">
              Loading meeting-intent replies…
              </div>
          ) : items.length === 0 ? (
            <div className="text-xs text-muted-foreground py-4">
              No meeting-intent replies found for this filter.
            </div>
            ) : (
              <div className="overflow-x-auto text-[11px]">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-800">
                    <th className="py-1 pr-2">Lead</th>
                    <th className="py-1 pr-2">Email</th>
                    <th className="py-1 pr-2">Company</th>
                    <th className="py-1 pr-2">Campaign</th>
                    <th className="py-1 pr-2">Intent</th>
                    <th className="py-1 pr-2">Summary</th>
                    <th className="py-1 pr-2 text-right">Received</th>
                    <th className="py-1 pr-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                  {items.map((item) => {
                    const lead = item.leads;
                    const campaign = item.campaigns;
                    const leadName = lead
                      ? [lead.first_name, lead.last_name]
                          .filter(Boolean)
                          .join(" ") || lead.email || item.from_email
                      : item.from_email;
                    const email = lead?.email || item.from_email || "—";
                    const company = lead?.company || "—";
                      return (
                        <tr
                        key={item.id}
                          className="border-b border-slate-900/80 last:border-b-0"
                        >
                        <td className="py-1 pr-2 align-top">
                          <div className="font-medium line-clamp-1">
                            {leadName || "Unknown lead"}
                            </div>
                          </td>
                        <td className="py-1 pr-2 align-top text-xs">
                          {email}
                        </td>
                        <td className="py-1 pr-2 align-top text-xs">
                          {company}
                          </td>
                        <td className="py-1 pr-2 align-top text-xs">
                          {campaign?.name || "—"}
                          </td>
                        <td className="py-1 pr-2 align-top">
                          {intentBadge(item.ai_meeting_intent)}
                          </td>
                        <td className="py-1 pr-2 align-top max-w-sm">
                          <div className="text-[10px] text-muted-foreground line-clamp-2">
                            {item.ai_intent_summary ||
                              item.body_plain ||
                              "(no summary)"}
                          </div>
                          </td>
                        <td className="py-1 pr-2 align-top text-right text-xs text-muted-foreground">
                          {new Date(
                            item.received_at
                          ).toLocaleString()}
                          </td>
                        <td className="py-1 pr-2 align-top text-right">
                          <MeetingReplyDialog
                            replyId={item.id}
                            leadName={
                              item.leads
                                ? [item.leads.first_name, item.leads.last_name]
                                    .filter(Boolean)
                                    .join(" ")
                                : null
                            }
                            leadEmail={item.leads?.email || item.from_email}
                          />
                        </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
  );
}
