"use client";

import * as React from "react";
import { ReplyIntentBadge } from "@/components/replies/reply-intent-badge";
import {
  CampaignLeadStatus,
  CampaignLeadStatusBadge,
} from "@/components/campaigns/campaign-lead-status-badge";
import { LeadTimelinePanel, LeadTimelinePanelData } from "./lead-timeline-panel";
import { useLeadDrawer } from "@/contexts/LeadDrawerContext";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";

type ReplyIntent =
  | "positive"
  | "neutral"
  | "negative"
  | "out_of_office"
  | "unsubscribe"
  | "bounce"
  | "spam"
  | "wrong_person"
  | "referral"
  | "not_sure"
  | null;

export interface CampaignLeadRow {
  id: string;
  lead_id: string;
  email: string;
  name?: string | null;
  status: CampaignLeadStatus;
  last_reply_intent: ReplyIntent;
  last_reply_sentiment?: "positive" | "neutral" | "negative" | null;
  replied_at?: string | null;
  last_sent_at?: string | null;
}

interface CampaignLeadsTableProps {
  rows: CampaignLeadRow[];
  campaignId: string;
}

const statusFilterOptions: { value: CampaignLeadStatus | "all"; label: string }[] =
  [
    { value: "all", label: "All statuses" },
    { value: "active", label: "Active" },
    { value: "replied", label: "Replied" },
    { value: "unsubscribed", label: "Unsubscribed" },
    { value: "bounced", label: "Bounced" },
    { value: "completed", label: "Completed" },
    { value: "error", label: "Error" },
  ];

const intentFilterOptions: { value: ReplyIntent | "all"; label: string }[] = [
  { value: "all", label: "All intents" },
  { value: "positive", label: "Positive" },
  { value: "neutral", label: "Neutral" },
  { value: "negative", label: "Negative" },
  { value: "out_of_office", label: "Out of office" },
  { value: "unsubscribe", label: "Unsubscribed" },
  { value: "bounce", label: "Bounced" },
  { value: "spam", label: "Spam" },
  { value: "wrong_person", label: "Wrong person" },
  { value: "referral", label: "Referral" },
  { value: "not_sure", label: "Not sure" },
];

export function CampaignLeadsTable({ rows, campaignId }: CampaignLeadsTableProps) {
  const [statusFilter, setStatusFilter] =
    React.useState<CampaignLeadStatus | "all">("all");
  const [intentFilter, setIntentFilter] =
    React.useState<ReplyIntent | "all">("all");
  const [search, setSearch] = React.useState("");

  const [panelOpen, setPanelOpen] = React.useState(false);
  const [panelData, setPanelData] = React.useState<LeadTimelinePanelData | null>(
    null
  );
  const [loadingLeadId, setLoadingLeadId] = React.useState<string | null>(null);
  const { openLead } = useLeadDrawer();

  const filtered = React.useMemo(() => {
    return rows.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) {
        return false;
      }

      if (intentFilter !== "all" && row.last_reply_intent !== intentFilter) {
        return false;
      }

      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const haystack = `${row.email} ${row.name ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [rows, statusFilter, intentFilter, search]);

  const handleRowClick = async (row: CampaignLeadRow) => {
    try {
      setLoadingLeadId(row.lead_id);
      const res = await fetch(
        `/api/campaigns/${campaignId}/lead-thread?leadId=${encodeURIComponent(
          row.lead_id
        )}`
      );
      if (!res.ok) {
        console.error("Failed to load lead thread");
        return;
      }
      const data = (await res.json()) as LeadTimelinePanelData;
      setPanelData(data);
      setPanelOpen(true);
    } finally {
      setLoadingLeadId(null);
    }
  };

  return (
    <>
      <div className="space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={statusFilter ?? "all"}
            onValueChange={(v) =>
              setStatusFilter(v === "all" ? "all" : (v as CampaignLeadStatus))
            }
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {statusFilterOptions.map((opt) => (
                <SelectItem key={opt.value ?? "all"} value={opt.value ?? "all"}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={intentFilter ?? "all"}
            onValueChange={(v) =>
              setIntentFilter(v === "all" ? "all" : (v as ReplyIntent))
            }
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Reply intent" />
            </SelectTrigger>
            <SelectContent>
              {intentFilterOptions.map((opt) => (
                <SelectItem key={opt.value ?? "all"} value={opt.value ?? "all"}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            placeholder="Search by name or email..."
            className="max-w-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Table */}
        <div className="rounded-2xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lead</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Reply Intent</TableHead>
                <TableHead>Last Reply</TableHead>
                <TableHead>Last Send</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-6 text-sm">
                    No leads match your filters.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((row) => {
                  const isLoading = loadingLeadId === row.lead_id;
                  return (
                    <TableRow
                      key={row.id}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => handleRowClick(row)}
                    >
                      <TableCell>
                        <div className="flex flex-col">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openLead(row.lead_id);
                            }}
                            className="text-sm font-medium hover:underline text-left"
                          >
                            {row.name || "Unknown"}
                          </button>
                          <span className="text-xs text-muted-foreground">
                            {row.email}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <CampaignLeadStatusBadge status={row.status} />
                      </TableCell>
                      <TableCell>
                        <ReplyIntentBadge
                          intent={row.last_reply_intent}
                          sentiment={row.last_reply_sentiment ?? null}
                        />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {row.replied_at
                          ? new Date(row.replied_at).toLocaleString()
                          : isLoading
                          ? "Loading..."
                          : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {row.last_sent_at
                          ? new Date(row.last_sent_at).toLocaleString()
                          : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <LeadTimelinePanel
        open={panelOpen}
        onOpenChange={setPanelOpen}
        data={panelData}
        campaignId={campaignId}
      />
    </>
  );
}

