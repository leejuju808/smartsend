"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  Flame,
  MailQuestion,
  Bot,
  RefreshCw,
  ArrowRight,
} from "lucide-react";

type CommandCenterRow = {
  lead_id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  title: string | null;
  pipeline_stage: string | null;
  conversion_score: number | null;
  do_not_contact: boolean | null;
  org_id: string | null;

  reply_id: string | null;
  replied_at: string | null;
  intent_label: string | null;
  intent_confidence: number | null;
  meeting_readiness: string | null;

  autopilot_job_id: string | null;
  next_autopilot_at: string | null;
  autopilot_status: string | null;
  autopilot_template_key: string | null;

  last_activity_at: string | null;
  last_event_type: string | null;
};

function formatTime(dateStr: string | null) {
  if (!dateStr) return "–";
  const d = new Date(dateStr);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function badgeForStage(stage: string | null | undefined) {
  if (!stage) return null;
  const base = "text-[10px] px-2 py-0.5 rounded-full border";
  switch (stage) {
    case "new":
      return (
        <span
          className={cn(
            base,
            "bg-slate-500/5 text-slate-500 border-slate-500/40",
          )}
        >
          new
        </span>
      );
    case "engaged":
      return (
        <span
          className={cn(
            base,
            "bg-blue-500/5 text-blue-500 border-blue-500/40",
          )}
        >
          engaged
        </span>
      );
    case "interested":
      return (
        <span
          className={cn(
            base,
            "bg-amber-500/5 text-amber-500 border-amber-500/40",
          )}
        >
          interested
        </span>
      );
    case "qualified":
      return (
        <span
          className={cn(
            base,
            "bg-emerald-500/5 text-emerald-500 border-emerald-500/40",
          )}
        >
          qualified
        </span>
      );
    case "meeting_booked":
      return (
        <span
          className={cn(
            base,
            "bg-green-500/5 text-green-500 border-green-500/40",
          )}
        >
          meeting booked
        </span>
      );
    case "dead":
      return (
        <span
          className={cn(
            base,
            "bg-red-500/5 text-red-500 border-red-500/40",
          )}
        >
          dead
        </span>
      );
    default:
      return (
        <span className={cn(base, "bg-muted text-muted-foreground")}>
          {stage}
        </span>
      );
  }
}

function badgeForIntent(intent: string | null | undefined) {
  if (!intent) return null;
  const cls =
    {
      ready_to_meet: "bg-green-500/10 text-green-500 border-green-500/40",
      open_to_chat: "bg-emerald-500/10 text-emerald-500 border-emerald-500/40",
      needs_info: "bg-blue-500/10 text-blue-500 border-blue-500/40",
      follow_up_later: "bg-amber-500/10 text-amber-500 border-amber-500/40",
      not_interested: "bg-red-500/10 text-red-500 border-red-500/40",
      unsubscribe: "bg-red-600/10 text-red-600 border-red-600/40",
      referral: "bg-purple-500/10 text-purple-500 border-purple-500/40",
      out_of_office: "bg-slate-500/10 text-slate-500 border-slate-500/40",
      unclear: "bg-slate-500/10 text-slate-500 border-slate-500/40",
    }[intent] ||
    "bg-muted text-muted-foreground border-border";

  return (
    <Badge
      variant="outline"
      className={cn("text-[10px] font-medium capitalize", cls)}
    >
      {intent.replace(/_/g, " ")}
    </Badge>
  );
}

export function CommandCenterBoard({ rows }: { rows: CommandCenterRow[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentTab = searchParams.get("view") || "all";
  const q = searchParams.get("q") || "";

  const hotCount = useMemo(
    () =>
      rows.filter(
        (r) => (r.conversion_score ?? 0) >= 40 && !!r.last_activity_at,
      ).length,
    [rows],
  );

  const needsReplyCount = useMemo(
    () =>
      rows.filter(
        (r) =>
          !!r.reply_id &&
          ["needs_info", "open_to_chat", "ready_to_meet", "follow_up_later"].includes(
            r.intent_label || "",
          ),
      ).length,
    [rows],
  );

  const aiQueueCount = useMemo(
    () => rows.filter((r) => !!r.autopilot_job_id).length,
    [rows],
  );

  const filteredRows = useMemo(() => {
    switch (currentTab) {
      case "hot":
        return rows.filter(
          (r) => (r.conversion_score ?? 0) >= 40 && !!r.last_activity_at,
        );
      case "needs_reply":
        return rows.filter(
          (r) =>
            !!r.reply_id &&
            ["needs_info", "open_to_chat", "ready_to_meet", "follow_up_later"].includes(
              r.intent_label || "",
            ),
        );
      case "ai_queue":
        return rows.filter((r) => !!r.autopilot_job_id);
      default:
        return rows;
    }
  }, [rows, currentTab]);

  const onSearch = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set("q", value);
    else params.delete("q");
    router.push(`?${params.toString()}`);
  };

  const onTabChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") params.delete("view");
    else params.set("view", value);
    router.push(`?${params.toString()}`);
  };

  const visibleRows = useMemo(() => {
    if (!q.trim()) return filteredRows;
    const s = q.toLowerCase().trim();
    return filteredRows.filter((r) => {
      const name = `${r.first_name || ""} ${r.last_name || ""}`.toLowerCase();
      return (
        (r.email || "").toLowerCase().includes(s) ||
        name.includes(s) ||
        (r.company || "").toLowerCase().includes(s)
      );
    });
  }, [filteredRows, q]);

  return (
    <Card className="space-y-4 p-4">
      {/* Controls */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Tabs
          defaultValue="all"
          value={currentTab}
          onValueChange={onTabChange}
          className="w-full md:w-auto"
        >
          <TabsList className="grid w-full grid-cols-4 md:w-auto md:grid-cols-4">
            <TabsTrigger value="all" className="flex items-center gap-1">
              <RefreshCw className="h-3 w-3" />
              <span className="hidden text-xs md:inline">All</span>
            </TabsTrigger>
            <TabsTrigger value="hot" className="flex items-center gap-1">
              <Flame className="h-3 w-3" />
              <span className="hidden text-xs md:inline">Hot</span>
              {hotCount > 0 && (
                <span className="ml-1 rounded-full bg-destructive px-1.5 text-[10px] text-destructive-foreground">
                  {hotCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="needs_reply" className="flex items-center gap-1">
              <MailQuestion className="h-3 w-3" />
              <span className="hidden text-xs md:inline">Needs reply</span>
              {needsReplyCount > 0 && (
                <span className="ml-1 rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
                  {needsReplyCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="ai_queue" className="flex items-center gap-1">
              <Bot className="h-3 w-3" />
              <span className="hidden text-xs md:inline">AI queue</span>
              {aiQueueCount > 0 && (
                <span className="ml-1 rounded-full bg-purple-500 px-1.5 text-[10px] text-white">
                  {aiQueueCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex w-full gap-2 md:w-64">
          <Input
            placeholder="Search by name, email, company..."
            defaultValue={q}
            onChange={(e) => onSearch(e.target.value)}
            className="h-8 text-xs"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-xs">
          <thead>
            <tr className="border-b text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="py-2 text-left">Lead</th>
              <th className="py-2 text-left">Stage / Score</th>
              <th className="py-2 text-left">Intent</th>
              <th className="py-2 text-left">AI SDR</th>
              <th className="py-2 text-left">Last activity</th>
              <th className="py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="py-6 text-center text-[11px] text-muted-foreground"
                >
                  No leads match your filters.
                </td>
              </tr>
            ) : (
              visibleRows.map((row) => {
                const name =
                  `${row.first_name || ""} ${row.last_name || ""}`.trim() ||
                  row.email ||
                  "Unknown";

                const score = row.conversion_score ?? 0;
                const isHot = score >= 40;
                const needsReply =
                  !!row.reply_id &&
                  ["needs_info", "open_to_chat", "ready_to_meet", "follow_up_later"].includes(
                    row.intent_label || "",
                  );

                return (
                  <tr
                    key={row.lead_id}
                    className={cn(
                      "border-b last:border-0",
                      needsReply ? "bg-primary/3" : "",
                    )}
                  >
                    {/* Lead */}
                    <td className="py-2 pr-3 align-top">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium">{name}</span>
                          {row.do_not_contact && (
                            <Badge
                              variant="outline"
                              className="border-red-500/40 bg-red-500/5 text-[9px] uppercase text-red-500"
                            >
                              DNC
                            </Badge>
                          )}
                          {isHot && !row.do_not_contact && (
                            <Badge
                              variant="outline"
                              className="border-amber-500/40 bg-amber-500/5 text-[9px] uppercase text-amber-500"
                            >
                              Hot
                            </Badge>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground">
                          {row.company && <span>{row.company}</span>}
                          {row.title && <span>· {row.title}</span>}
                          {row.email && (
                            <span className="hidden md:inline">· {row.email}</span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Stage / Score */}
                    <td className="py-2 pr-3 align-top">
                      <div className="flex flex-col gap-1">
                        {badgeForStage(row.pipeline_stage)}
                        <span className="text-[11px] text-muted-foreground">
                          Score: {score}
                        </span>
                      </div>
                    </td>

                    {/* Intent */}
                    <td className="py-2 pr-3 align-top">
                      <div className="flex flex-col gap-1">
                        {badgeForIntent(row.intent_label)}
                        {typeof row.intent_confidence === "number" && (
                          <span className="text-[10px] text-muted-foreground">
                            {(row.intent_confidence * 100).toFixed(0)}% conf
                          </span>
                        )}
                        {row.meeting_readiness && (
                          <span className="text-[10px] uppercase text-muted-foreground">
                            Ready: {row.meeting_readiness}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* AI SDR */}
                    <td className="py-2 pr-3 align-top">
                      {row.autopilot_job_id ? (
                        <div className="flex flex-col gap-1">
                          <Badge
                            variant="outline"
                            className="border-purple-500/40 bg-purple-500/5 text-[10px] text-purple-500"
                          >
                            AI follow-up queued
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">
                            {row.autopilot_template_key || "template"} ·{" "}
                            {row.autopilot_status || "pending"}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            Next: {formatTime(row.next_autopilot_at)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">
                          No AI job
                        </span>
                      )}
                    </td>

                    {/* Last activity */}
                    <td className="py-2 pr-3 align-top">
                      <div className="flex flex-col gap-1">
                        <span className="text-[11px]">
                          {formatTime(row.last_activity_at)}
                        </span>
                        {row.last_event_type && (
                          <span className="text-[10px] uppercase text-muted-foreground">
                            {row.last_event_type}
                          </span>
                        )}
                        {row.replied_at && (
                          <span className="text-[10px] text-emerald-500">
                            Last reply: {formatTime(row.replied_at)}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="py-2 pl-3 text-right align-top">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7"
                          onClick={() =>
                            router.push(`/dashboard/leads/${row.lead_id}`)
                          }
                        >
                          <ArrowRight className="h-3 w-3" />
                        </Button>
                        {/* later: manual bump / pause AI / call task */}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

