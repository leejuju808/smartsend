"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Users,
  Bot,
  Mail,
  MessageCircle,
  CalendarCheck,
  ArrowUpDown,
} from "lucide-react";

type Row = {
  user_id: string;
  name: string;
  email: string;

  owned_lead_count: number;
  human_sent_30d: number;
  ai_sent_30d: number;

  replies_30d: number;
  interested_replies_30d: number;
  meetings_30d: number;

  human_reply_rate_30d: number;
  ai_reply_rate_30d: number;
};

type SortKey =
  | "owned_lead_count"
  | "human_sent_30d"
  | "ai_sent_30d"
  | "replies_30d"
  | "meetings_30d"
  | "human_reply_rate_30d"
  | "ai_reply_rate_30d";

export function SdrTeamBoard({ rows }: { rows: Row[] }) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("meetings_30d");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = rows;

    if (q) {
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.email.toLowerCase().includes(q),
      );
    }

    list = [...list].sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      if (va === vb) return 0;
      if (sortDir === "asc") return va < vb ? -1 : 1;
      return va > vb ? -1 : 1;
    });

    return list;
  }, [rows, query, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sortButton = (key: SortKey) => (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn(
        "h-6 w-6",
        key === sortKey && "text-primary",
      )}
      onClick={() => toggleSort(key)}
    >
      <ArrowUpDown className="h-3 w-3" />
    </Button>
  );

  const totalMeetings = rows.reduce((n, r) => n + (r.meetings_30d || 0), 0);

  return (
    <Card className="space-y-4 p-4 text-xs">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <div>
            <h2 className="text-sm font-semibold">
              Team performance (last 30 days)
            </h2>
            <p className="text-[11px] text-muted-foreground">
              Total meetings: {totalMeetings}
            </p>
          </div>
        </div>
        <div className="w-full md:w-64">
          <Input
            placeholder="Search reps by name or email..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-8 text-xs"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-[11px]">
          <thead>
            <tr className="border-b text-[10px] uppercase tracking-wide text-muted-foreground">
              <th className="py-1 text-left">Rep</th>
              <th className="py-1 text-right">
                <div className="inline-flex items-center gap-1">
                  Leads
                  {sortButton("owned_lead_count")}
                </div>
              </th>
              <th className="py-1 text-right">
                <div className="inline-flex items-center gap-1">
                  <Mail className="h-3 w-3" /> Human sends
                  {sortButton("human_sent_30d")}
                </div>
              </th>
              <th className="py-1 text-right">
                <div className="inline-flex items-center gap-1">
                  <Bot className="h-3 w-3" /> AI sends
                  {sortButton("ai_sent_30d")}
                </div>
              </th>
              <th className="py-1 text-right">
                <div className="inline-flex items-center gap-1">
                  <MessageCircle className="h-3 w-3" /> Replies
                  {sortButton("replies_30d")}
                </div>
              </th>
              <th className="py-1 text-right">
                <div className="inline-flex items-center gap-1">
                  <CalendarCheck className="h-3 w-3 text-emerald-500" /> Meetings
                  {sortButton("meetings_30d")}
                </div>
              </th>
              <th className="py-1 text-right">
                <div className="inline-flex items-center gap-1">
                  Human reply %
                  {sortButton("human_reply_rate_30d")}
                </div>
              </th>
              <th className="py-1 text-right">
                <div className="inline-flex items-center gap-1">
                  AI reply %
                  {sortButton("ai_reply_rate_30d")}
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="py-4 text-center text-[11px] text-muted-foreground"
                >
                  No SDR activity yet for the last 30 days.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.user_id} className="border-b last:border-0">
                  <td className="py-1 pr-2 text-left align-top">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-medium">
                        {r.name}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {r.email}
                      </span>
                    </div>
                  </td>
                  <td className="py-1 px-2 text-right align-top">
                    {r.owned_lead_count}
                  </td>
                  <td className="py-1 px-2 text-right align-top">
                    {r.human_sent_30d}
                  </td>
                  <td className="py-1 px-2 text-right align-top">
                    {r.ai_sent_30d}
                  </td>
                  <td className="py-1 px-2 text-right align-top">
                    {r.replies_30d}
                    {r.interested_replies_30d > 0 && (
                      <span className="ml-1 text-[10px] text-emerald-500">
                        ({r.interested_replies_30d})
                      </span>
                    )}
                  </td>
                  <td className="py-1 px-2 text-right align-top">
                    {r.meetings_30d}
                  </td>
                  <td className="py-1 px-2 text-right align-top">
                    {r.human_reply_rate_30d.toFixed(1)}%
                  </td>
                  <td className="py-1 px-2 text-right align-top">
                    {r.ai_reply_rate_30d.toFixed(1)}%
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

