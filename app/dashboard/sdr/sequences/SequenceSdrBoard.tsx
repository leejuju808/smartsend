"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import {
  Bot,
  Mail,
  MessageCircle,
  CalendarCheck,
  ArrowUpDown,
  ArrowRight,
} from "lucide-react";

type Row = {
  sequence_id: string;
  sequence_name: string;
  sequence_status: string;

  ai_sdr_sent: number;
  campaign_sent: number;
  total_replies: number;
  interested_replies: number;
  meetings_booked: number;

  ai_reply_rate: number;
  ai_interested_rate: number;
  ai_meeting_rate: number;
};

type SortKey =
  | "ai_sdr_sent"
  | "ai_reply_rate"
  | "ai_meeting_rate"
  | "meetings_booked";

export function SequenceSdrBoard({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("ai_meeting_rate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = rows;

    if (q) {
      list = list.filter((r) =>
        r.sequence_name.toLowerCase().includes(q),
      );
    }

    list = [...list].sort((a, b) => {
      const valA = a[sortKey];
      const valB = b[sortKey];
      if (valA === valB) return 0;
      if (sortDir === "asc") return valA < valB ? -1 : 1;
      return valA > valB ? -1 : 1;
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

  const sortLabel = (key: SortKey) => {
    const active = key === sortKey;
    return (
      <Button
        type="button"
        variant="ghost"
        size="xs"
        className={cn("h-6 w-6", active && "text-primary")}
        onClick={() => toggleSort(key)}
      >
        <ArrowUpDown className="h-3 w-3" />
      </Button>
    );
  };

  return (
    <Card className="space-y-4 p-4 text-xs">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-purple-500" />
          <div>
            <h2 className="text-sm font-semibold">
              Sequences ranked by AI performance
            </h2>
            <p className="text-[11px] text-muted-foreground">
              Sort by meeting rate, reply rate, or volume to see what's printing.
            </p>
          </div>
        </div>
        <div className="w-full md:w-64">
          <Input
            placeholder="Search sequences..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-8 text-xs"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[780px] text-[11px]">
          <thead>
            <tr className="border-b text-[10px] uppercase tracking-wide text-muted-foreground">
              <th className="py-1 text-left">Sequence</th>
              <th className="py-1 text-right">
                <div className="inline-flex items-center gap-1">
                  <Bot className="h-3 w-3" /> AI sends
                  {sortLabel("ai_sdr_sent")}
                </div>
              </th>
              <th className="py-1 text-right">
                <div className="inline-flex items-center gap-1">
                  <Mail className="h-3 w-3" /> Campaign sends
                </div>
              </th>
              <th className="py-1 text-right">
                <div className="inline-flex items-center gap-1">
                  <MessageCircle className="h-3 w-3" /> Replies
                </div>
              </th>
              <th className="py-1 text-right">
                <div className="inline-flex items-center gap-1">
                  <MessageCircle className="h-3 w-3 text-emerald-500" /> Interested
                </div>
              </th>
              <th className="py-1 text-right">
                <div className="inline-flex items-center gap-1">
                  <CalendarCheck className="h-3 w-3 text-emerald-500" /> Meetings
                  {sortLabel("meetings_booked")}
                </div>
              </th>
              <th className="py-1 text-right">
                <div className="inline-flex items-center gap-1">
                  AI reply %
                  {sortLabel("ai_reply_rate")}
                </div>
              </th>
              <th className="py-1 text-right">
                <div className="inline-flex items-center gap-1">
                  AI meeting %
                  {sortLabel("ai_meeting_rate")}
                </div>
              </th>
              <th className="py-1 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  className="py-4 text-center text-[11px] text-muted-foreground"
                >
                  No sequences with AI SDR data yet.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.sequence_id} className="border-b last:border-0">
                  {/* Sequence name */}
                  <td className="py-1 pr-2 text-left align-top">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-xs font-medium">
                        {r.sequence_name}
                      </span>
                      <Badge
                        variant="outline"
                        className={cn(
                          "w-fit text-[9px]",
                          r.sequence_status === "active"
                            ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-500"
                            : "border-slate-500/40 bg-slate-500/5 text-slate-500",
                        )}
                      >
                        {r.sequence_status}
                      </Badge>
                    </div>
                  </td>

                  {/* AI sends */}
                  <td className="py-1 px-2 text-right align-top">
                    {r.ai_sdr_sent}
                  </td>

                  {/* Campaign sends */}
                  <td className="py-1 px-2 text-right align-top">
                    {r.campaign_sent}
                  </td>

                  {/* Replies */}
                  <td className="py-1 px-2 text-right align-top">
                    {r.total_replies}
                  </td>

                  {/* Interested replies */}
                  <td className="py-1 px-2 text-right align-top">
                    {r.interested_replies}
                  </td>

                  {/* Meetings */}
                  <td className="py-1 px-2 text-right align-top">
                    {r.meetings_booked}
                  </td>

                  {/* AI reply rate */}
                  <td className="py-1 px-2 text-right align-top">
                    {r.ai_reply_rate.toFixed(1)}%
                  </td>

                  {/* AI meeting rate */}
                  <td className="py-1 px-2 text-right align-top">
                    {r.ai_meeting_rate.toFixed(1)}%
                  </td>

                  {/* Actions */}
                  <td className="py-1 pl-2 text-right align-top">
                    <Button
                      size="xs"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() =>
                        router.push(`/dashboard/sequences/${r.sequence_id}`)
                      }
                    >
                      <ArrowRight className="h-3 w-3" />
                    </Button>
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

