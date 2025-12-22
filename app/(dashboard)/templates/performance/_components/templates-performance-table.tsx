// app/(dashboard)/templates/performance/_components/templates-performance-table.tsx

"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export interface TemplatePerformanceRow {
  template_id: string;
  template_name: string | null;
  template_subject: string | null;
  total_sends: number;
  total_leads_sent: number;
  total_replies: number;
  total_leads_replied: number;
  reply_rate_leads_pct: number;
  intent_positive_count: number;
  intent_referral_count: number;
  intent_unsubscribe_count: number;
  intent_bounce_count: number;
  intent_spam_count: number;
  first_send_at: string | null;
  last_send_at: string | null;
}

interface TemplatesPerformanceTableProps {
  rows: TemplatePerformanceRow[];
}

type SortKey =
  | "reply_rate_leads_pct"
  | "total_sends"
  | "total_leads_sent"
  | "total_replies"
  | "intent_positive_count";

export function TemplatesPerformanceTable({
  rows,
}: TemplatesPerformanceTableProps) {
  const [search, setSearch] = React.useState("");
  const [sortKey, setSortKey] = React.useState<SortKey>("reply_rate_leads_pct");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("desc");

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const filteredSorted = React.useMemo(() => {
    let filtered = rows;

    if (search.trim()) {
      const q = search.toLowerCase().trim();
      filtered = filtered.filter((r) => {
        const haystack = `${r.template_name ?? ""} ${
          r.template_subject ?? ""
        }`.toLowerCase();
        return haystack.includes(q);
      });
    }

    const sorted = [...filtered].sort((a, b) => {
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
      if (av === bv) return 0;
      return sortDir === "asc" ? av - bv : bv - av;
    });

    return sorted;
  }, [rows, search, sortKey, sortDir]);

  const totalTemplates = rows.length;
  const anySends = rows.some((r) => r.total_sends > 0);

  return (
    <div className="space-y-4">
      {/* Top summary + search */}
      <div className="flex flex-wrap items-center gap-3">
        <Card className="rounded-2xl px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              Templates tracked
            </span>
            <span className="text-sm font-semibold">{totalTemplates}</span>
          </div>
        </Card>

        <Card className="rounded-2xl px-3 py-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              Templates with sends
            </span>
            <span className="text-sm font-semibold">
              {rows.filter((r) => r.total_sends > 0).length}
            </span>
          </div>
        </Card>

        <Input
          placeholder="Search by template name or subject..."
          className="max-w-xs ml-auto"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Leaderboard table */}
      <div className="rounded-2xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Template</TableHead>

              <TableHead className="text-right">
                <SortButton
                  label="Leads sent"
                  active={sortKey === "total_leads_sent"}
                  dir={sortDir}
                  onClick={() => toggleSort("total_leads_sent")}
                />
              </TableHead>

              <TableHead className="text-right">
                <SortButton
                  label="Leads replied"
                  active={sortKey === "total_replies"}
                  dir={sortDir}
                  onClick={() => toggleSort("total_replies")}
                />
              </TableHead>

              <TableHead className="text-right">
                <SortButton
                  label="Reply rate"
                  active={sortKey === "reply_rate_leads_pct"}
                  dir={sortDir}
                  onClick={() => toggleSort("reply_rate_leads_pct")}
                />
              </TableHead>

              <TableHead className="text-right">
                <SortButton
                  label="Positive"
                  active={sortKey === "intent_positive_count"}
                  dir={sortDir}
                  onClick={() => toggleSort("intent_positive_count")}
                />
              </TableHead>

              <TableHead className="text-right">
                Unsub / Bounce / Spam
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!anySends ? (
              <TableRow>
                <TableCell colSpan={6} className="py-6 text-center text-sm">
                  No sends yet. Once you start sending campaigns with templates,
                  you'll see performance stats here.
                </TableCell>
              </TableRow>
            ) : filteredSorted.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-6 text-center text-sm">
                  No templates match your search.
                </TableCell>
              </TableRow>
            ) : (
              filteredSorted.map((row) => {
                const replyRate = Number(row.reply_rate_leads_pct ?? 0);
                const unsubTotal =
                  row.intent_unsubscribe_count +
                  row.intent_bounce_count +
                  row.intent_spam_count;

                const heat =
                  replyRate >= 20
                    ? "high"
                    : replyRate >= 10
                    ? "medium"
                    : replyRate > 0
                    ? "low"
                    : "none";

                return (
                  <TableRow key={row.template_id}>
                    {/* Template */}
                    <TableCell>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/templates/${row.template_id}`}
                            className="text-sm font-medium hover:underline"
                          >
                            {row.template_name || "Untitled template"}
                          </Link>
                          {heat !== "none" && (
                            <Badge
                              variant={
                                heat === "high"
                                  ? "default"
                                  : heat === "medium"
                                  ? "secondary"
                                  : "outline"
                              }
                              className="text-[10px]"
                            >
                              {heat === "high"
                                ? "Top performer"
                                : heat === "medium"
                                ? "Solid"
                                : "Has replies"}
                            </Badge>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground line-clamp-1">
                          {row.template_subject || "No subject"}
                        </span>
                        <span className="text-[10px] text-muted-foreground mt-0.5">
                          {row.first_send_at
                            ? new Date(
                                row.first_send_at
                              ).toLocaleDateString()
                            : "No sends yet"}{" "}
                          {row.last_send_at &&
                            `– ${new Date(
                              row.last_send_at
                            ).toLocaleDateString()}`}
                        </span>
                      </div>
                    </TableCell>

                    {/* Leads sent */}
                    <TableCell className="text-right text-sm text-muted-foreground">
                      {row.total_leads_sent}
                      <div className="text-[10px]">
                        {row.total_sends} sends
                      </div>
                    </TableCell>

                    {/* Leads replied */}
                    <TableCell className="text-right text-sm text-muted-foreground">
                      {row.total_leads_replied}
                      <div className="text-[10px]">
                        {row.total_replies} replies
                      </div>
                    </TableCell>

                    {/* Reply rate */}
                    <TableCell className="text-right">
                      <span
                        className={cn(
                          "text-sm font-semibold",
                          replyRate >= 20 && "text-emerald-600",
                          replyRate >= 10 &&
                            replyRate < 20 &&
                            "text-emerald-500",
                          replyRate > 0 &&
                            replyRate < 10 &&
                            "text-amber-600",
                          replyRate === 0 && "text-muted-foreground"
                        )}
                      >
                        {replyRate.toFixed(1)}%
                      </span>
                    </TableCell>

                    {/* Positive intent */}
                    <TableCell className="text-right text-sm">
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="font-medium text-emerald-600">
                          {row.intent_positive_count}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          +{row.intent_referral_count} referrals
                        </span>
                      </div>
                    </TableCell>

                    {/* Negative stuff */}
                    <TableCell className="text-right text-sm">
                      <div className="flex flex-col items-end gap-0.5">
                        <span className="text-[11px] text-muted-foreground">
                          Unsub: {row.intent_unsubscribe_count}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          Bounce: {row.intent_bounce_count}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          Spam: {row.intent_spam_count}
                        </span>
                        {unsubTotal > 0 && (
                          <span className="text-[10px] text-red-500">
                            {unsubTotal} total bad outcomes
                          </span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function SortButton({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn(
        "h-7 px-1 text-[11px] font-medium text-muted-foreground hover:text-foreground",
        active && "text-foreground"
      )}
      onClick={onClick}
    >
      <span>{label}</span>
      <ArrowUpDown
        className={cn(
          "ml-1 h-3 w-3 opacity-60",
          active && dir === "asc" && "rotate-180"
        )}
      />
    </Button>
  );
}































































