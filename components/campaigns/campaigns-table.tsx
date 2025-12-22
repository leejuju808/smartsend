"use client";

import * as React from "react";
import Link from "next/link";
import {
  listCampaignsWithStats,
  type CampaignWithStats,
} from "@/app/api/campaigns/list-with-stats/actions";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Loader2,
  Rocket,
  Filter,
  Target,
  MailOpen,
  CheckCircle2,
} from "lucide-react";
import { useCampaignAudience } from "@/lib/hooks/useCampaignAudience";
import { CampaignStatusBadge } from "@/components/campaigns/CampaignStatusBadge";
import { CampaignHealthPill } from "@/components/campaigns/CampaignHealthPill";
import { CampaignHealthDrawer } from "@/components/campaigns/CampaignHealthDrawer";

interface CampaignsTableProps {
  accountId: string;
}

function statusBadge(status: string | null) {
  if (!status) return <CampaignStatusBadge status="draft" />;
  
  // Use CampaignStatusBadge for all statuses
  return <CampaignStatusBadge status={status as any} />;
}

function CampaignListRow({ 
  campaign, 
  selected, 
  onToggle,
  onHealthClick
}: { 
  campaign: CampaignWithStats;
  selected: boolean;
  onToggle: () => void;
  onHealthClick: (campaignId: string, campaignName: string) => void;
}) {
  const { audience, loading } = useCampaignAudience(campaign.id);
  const replyRateLocal =
    campaign.total_sends > 0
      ? ((campaign.total_replied / campaign.total_sends) * 100).toFixed(1)
      : "0.0";

  return (
    <tr className="border-t hover:bg-muted/40">
      <td className="px-3 py-2 align-top">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="cursor-pointer"
        />
      </td>
      <td className="px-3 py-2 align-top">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="font-medium truncate max-w-[220px]">
              {campaign.name}
            </span>
            {(campaign as any).visibility && (
              <Badge
                variant={(campaign as any).visibility === "private" ? "outline" : "default"}
                className="text-[10px] uppercase tracking-wide"
              >
                {(campaign as any).visibility === "private" ? "Private" : "Shared"}
              </Badge>
            )}
          </div>
          <span className="text-[11px] text-muted-foreground">
            {statusBadge(campaign.status)}
          </span>
        </div>
      </td>
      <td className="px-3 py-2 align-top">
        <div className="flex flex-wrap gap-1 items-center">
          {campaign.smartlist_id ? (
            <Badge className="text-xs bg-purple-600 text-white">
              🤖 SmartList
            </Badge>
          ) : campaign.segment_id ? (
            <Badge variant="outline" className="text-xs">
              Segment: {campaign.segment_name ?? "Unnamed"}
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-xs">
              Everyone
            </Badge>
          )}
        </div>
      </td>
      <td className="px-3 py-2 align-top">
        {loading ? (
          <span className="text-muted-foreground text-xs">loading…</span>
        ) : (
          <Badge className="text-xs">
            {audience ?? 0} leads
          </Badge>
        )}
      </td>
      <td className="px-3 py-2 align-top">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">
            {campaign.total_sends} sends · {campaign.total_replied} replies
          </span>
          <div className="flex gap-1 flex-wrap">
            {campaign.open_rate !== null && campaign.open_rate !== undefined && (
              <Badge variant="outline" className="text-xs">
                {campaign.open_rate.toFixed(1)}% opens
              </Badge>
            )}
            {campaign.click_rate !== null && campaign.click_rate !== undefined && (
              <Badge variant="outline" className="text-xs">
                {campaign.click_rate.toFixed(1)}% clicks
              </Badge>
            )}
          </div>
        </div>
      </td>
      <td className="px-3 py-2 align-top">
        <span className="text-[11px] text-muted-foreground">
          {replyRateLocal}%
        </span>
      </td>
      <td className="px-3 py-2 align-top">
        <CampaignHealthPill
          campaignId={campaign.id}
          onClick={() => onHealthClick(campaign.id, campaign.name)}
        />
      </td>
      <td className="px-3 py-2 align-top">
        <span className="text-[11px] text-muted-foreground">
          {new Date(campaign.created_at).toLocaleString()}
        </span>
      </td>
      <td className="px-3 py-2 align-top">
        <Link href={`/campaigns/${campaign.id}`} className="inline-block">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2 text-[11px]"
          >
            Open
          </Button>
        </Link>
      </td>
    </tr>
  );
}

export function CampaignsTable({ accountId }: CampaignsTableProps) {
  const [rows, setRows] = React.useState<CampaignWithStats[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [role, setRole] = React.useState<string | null>(null);
  const [statusFilter, setStatusFilter] = React.useState<
    "all" | "draft" | "scheduled" | "running" | "paused" | "completed"
  >("all");
  const [healthDrawerOpen, setHealthDrawerOpen] = React.useState(false);
  const [selectedCampaignForHealth, setSelectedCampaignForHealth] = React.useState<{
    id: string;
    name: string;
  } | null>(null);

  // Fetch user role
  React.useEffect(() => {
    fetch("/api/me/role")
      .then((res) => res.json())
      .then((data) => {
        setRole(data.role ?? null);
      })
      .catch(() => {
        setRole(null);
      });
  }, []);

  const toggle = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  async function refresh(opts?: { keepLoading?: boolean }) {
    if (!opts?.keepLoading) setLoading(true);
    try {
      const data = await listCampaignsWithStats(accountId);
      setRows(data);
    } catch (err) {
      console.error(err);
    } finally {
      if (!opts?.keepLoading) setLoading(false);
    }
  }

  React.useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  const filtered = React.useMemo(() => {
    if (statusFilter === "all") return rows;
    return rows.filter((c) => (c.status || "draft") === statusFilter);
  }, [rows, statusFilter]);

  const toggleAll = React.useCallback(() => {
    if (selected.length === filtered.length) {
      setSelected([]);
    } else {
      setSelected(filtered.map((c) => c.id));
    }
  }, [selected.length, filtered]);

  const handleBatchPause = async () => {
    if (selected.length === 0) return;
    try {
      await fetch("/api/campaigns/batch/pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selected }),
      });
      setSelected([]);
      refresh();
    } catch (err) {
      console.error("Failed to pause campaigns:", err);
    }
  };

  const handleBatchResume = async () => {
    if (selected.length === 0) return;
    try {
      await fetch("/api/campaigns/batch/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selected }),
      });
      setSelected([]);
      refresh();
    } catch (err) {
      console.error("Failed to resume campaigns:", err);
    }
  };

  const handleBatchDelete = async () => {
    if (selected.length === 0) return;
    if (!confirm(`Are you sure you want to delete ${selected.length} campaign(s)?`)) {
      return;
    }
    try {
      await fetch("/api/campaigns/batch/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: selected }),
      });
      setSelected([]);
      refresh();
    } catch (err) {
      console.error("Failed to delete campaigns:", err);
    }
  };

  const total = rows.length;
  const totalSends = rows.reduce((sum, c) => sum + c.total_sends, 0);
  const totalReplies = rows.reduce((sum, c) => sum + c.total_replied, 0);
  const replyRate =
    totalSends > 0 ? ((totalReplies / totalSends) * 100).toFixed(1) : "0.0";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Rocket className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-base font-semibold">Campaigns</h1>
            <p className="text-xs text-muted-foreground">
              Overview of all campaigns, their segments, and reply performance.
            </p>
          </div>
        </div>
        {loading && (
          <span className="inline-flex items-center text-[11px] text-muted-foreground">
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            Loading…
          </span>
        )}
      </div>

      {/* Filter strip */}
      <Card className="border bg-card px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground mr-1">Status</span>

          {(["all", "draft", "scheduled", "running", "paused", "completed", "paused_quota"] as const).map(
            (s) => (
              <Button
                key={s}
                type="button"
                size="sm"
                variant={s === statusFilter ? "default" : "outline"}
                className={cn(
                  "h-7 px-2 text-[11px]",
                  s === statusFilter && "bg-primary text-primary-foreground"
                )}
                onClick={() => setStatusFilter(s)}
              >
                {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
              </Button>
            )
          )}
        </div>
      </Card>

      {/* Stats strip */}
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Rocket className="h-3 w-3" /> Total campaigns
          </p>
          <p className="mt-1 text-lg font-semibold">{total}</p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <MailOpen className="h-3 w-3" /> Total sends
          </p>
          <p className="mt-1 text-lg font-semibold">{totalSends}</p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3 text-emerald-500" /> Replies (%)
          </p>
          <p className="mt-1 text-lg font-semibold">
            {replyRate}
            <span className="ml-1 text-xs text-muted-foreground">reply rate</span>
          </p>
        </div>
      </div>

      {/* Bulk Actions Toolbar */}
      {selected.length > 0 && role && role !== "viewer" && (
        <div className="flex gap-3 mb-3 text-xs">
          <Button
            size="sm"
            variant="outline"
            onClick={handleBatchPause}
            className="h-7 px-2 text-[11px]"
          >
            Pause ({selected.length})
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={handleBatchResume}
            className="h-7 px-2 text-[11px]"
          >
            Resume ({selected.length})
          </Button>

          {/* Delete - admin/owner only */}
          {(role === "admin" || role === "owner") && (
            <Button
              size="sm"
              variant="destructive"
              onClick={handleBatchDelete}
              className="h-7 px-2 text-[11px]"
            >
              Delete ({selected.length})
            </Button>
          )}
        </div>
      )}

      {/* Table */}
      <Card className="border bg-card">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-xs text-muted-foreground">
            Showing <span className="font-semibold">{filtered.length}</span> campaigns.
          </p>
        </div>

        {filtered.length === 0 ? (
          <div className="px-3 py-8 text-center text-xs text-muted-foreground">
            No campaigns in this view yet.
          </div>
        ) : (
          <div className="max-h-[540px] overflow-auto">
            <table className="min-w-full text-xs">
              <thead className="sticky top-0 z-10 bg-muted">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold w-[40px]">
                    <input
                      type="checkbox"
                      checked={selected.length === filtered.length && filtered.length > 0}
                      onChange={toggleAll}
                      className="cursor-pointer"
                    />
                  </th>
                  <th className="px-3 py-2 text-left font-semibold">Campaign</th>
                  <th className="px-3 py-2 text-left font-semibold">
                    Segment
                  </th>
                  <th className="px-3 py-2 text-left font-semibold">
                    Audience
                  </th>
                  <th className="px-3 py-2 text-left font-semibold">
                    Sends / Replies
                  </th>
                  <th className="px-3 py-2 text-left font-semibold">
                    Reply rate
                  </th>
                  <th className="px-3 py-2 text-left font-semibold">
                    Health
                  </th>
                  <th className="px-3 py-2 text-left font-semibold">
                    Created
                  </th>
                  <th className="px-3 py-2 text-left font-semibold w-[80px]"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <CampaignListRow 
                    key={c.id} 
                    campaign={c} 
                    selected={selected.includes(c.id)}
                    onToggle={() => toggle(c.id)}
                    onHealthClick={(id, name) => {
                      setSelectedCampaignForHealth({ id, name });
                      setHealthDrawerOpen(true);
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Health Drawer */}
      {selectedCampaignForHealth && (
        <CampaignHealthDrawer
          campaignId={selectedCampaignForHealth.id}
          campaignName={selectedCampaignForHealth.name}
          isOpen={healthDrawerOpen}
          onClose={() => {
            setHealthDrawerOpen(false);
            setSelectedCampaignForHealth(null);
          }}
        />
      )}
    </div>
  );
}

