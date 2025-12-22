"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SendCapNudge } from "@/components/billing/SendCapNudge";
import { BillingStatusNudge } from "@/components/billing/BillingStatusNudge";
import {
  useCampaignOutcomes,
  CampaignOutcome,
} from "@/lib/hooks/useCampaignOutcomes";

type Campaign = {
  id: string;
  name: string;
  status: string;
  is_shared: boolean;
  created_by: string | null;
  created_at: string;
  profiles?: {
    id: string;
    full_name: string | null;
  } | null;
};

type Scope = "my" | "team" | "all";

type SortBy =
  | "created_at"
  | "sent"
  | "replies"
  | "meetings"
  | "closed_won"
  | "reply_rate"
  | "meeting_rate"
  | "rev_per_thousand";

type SortDir = "asc" | "desc";

export default function CampaignsPage() {
  const [scope, setScope] = useState<Scope>("team");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | undefined>();

  const { outcomes, loading: loadingOutcomes, reload: reloadOutcomes } =
    useCampaignOutcomes();

  const [sortBy, setSortBy] = useState<SortBy>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const load = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("scope", scope);
    const res = await fetch(`/api/campaigns/list?${params.toString()}`);
    const json = await res.json();
    setCampaigns(json.campaigns || []);
    setCurrentUserId(json.currentUserId);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  const outcomesByCampaignId = useMemo(() => {
    const map: Record<string, CampaignOutcome> = {};
    for (const o of outcomes) {
      map[o.campaign_id] = o;
    }
    return map;
  }, [outcomes]);

  // Derived metrics: reply %, meeting %, closed-won per 1k sends
  const campaignsWithMetrics = useMemo(() => {
    return campaigns.map((c) => {
      const o = outcomesByCampaignId[c.id];

      const sent = o?.total_sent ?? 0;
      const replies = o?.total_replies ?? 0;
      const meetings = o?.total_meetings ?? 0;
      const closedWonCents = o?.closed_won_value_cents ?? 0;

      const replyRate = sent > 0 ? replies / sent : 0;
      const meetingRate = sent > 0 ? meetings / sent : 0;
      const revPerThousand =
        sent > 0 ? (closedWonCents / 100 / sent) * 1000 : 0; // USD per 1k sends

      return {
        campaign: c,
        sent,
        replies,
        meetings,
        closedWonCents,
        replyRate,
        meetingRate,
        revPerThousand,
      };
    });
  }, [campaigns, outcomesByCampaignId]);

  const sortedCampaigns = useMemo(() => {
    const list = [...campaignsWithMetrics];

    list.sort((a, b) => {
      const dirFactor = sortDir === "asc" ? 1 : -1;

      const val = (key: SortBy, row: (typeof campaignsWithMetrics)[number]) => {
        switch (key) {
          case "created_at":
            return new Date(row.campaign.created_at).getTime();
          case "sent":
            return row.sent;
          case "replies":
            return row.replies;
          case "meetings":
            return row.meetings;
          case "closed_won":
            return row.closedWonCents;
          case "reply_rate":
            return row.replyRate;
          case "meeting_rate":
            return row.meetingRate;
          case "rev_per_thousand":
            return row.revPerThousand;
          default:
            return 0;
        }
      };

      const va = val(sortBy, a);
      const vb = val(sortBy, b);

      if (va === vb) {
        // tie-breaker: created_at desc
        const ca = new Date(a.campaign.created_at).getTime() || 0;
        const cb = new Date(b.campaign.created_at).getTime() || 0;
        return (cb - ca) * dirFactor;
      }

      return (va - vb) * dirFactor;
    });

    return list;
  }, [campaignsWithMetrics, sortBy, sortDir]);

  const toggleSort = (key: SortBy) => {
    if (sortBy === key) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(key);
      setSortDir("desc");
    }
  };

  const handleRefresh = () => {
    load();
    reloadOutcomes();
  };

  const sortIcon = (key: SortBy) => {
    if (sortBy !== key) return null;
    return (
      <span className="ml-1 text-[9px]">{sortDir === "asc" ? "▲" : "▼"}</span>
    );
  };

  const formatPercent = (v: number) =>
    (v * 100).toLocaleString(undefined, {
      maximumFractionDigits: 1,
    }) + "%";

  const formatMoney = (v: number) =>
    v.toLocaleString(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    });

  return (
    <div className="p-6 space-y-4">
      {/* Billing status nudge */}
      <BillingStatusNudge />
      {/* Cap warning / upgrade nudge */}
      <SendCapNudge />

      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold">Campaigns</h1>
          <p className="text-xs text-muted-foreground">
            See which campaigns are generating replies, meetings, and revenue.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            className="h-8 px-3 text-[11px] bg-amber-600 text-white hover:bg-amber-700 font-semibold"
            onClick={async () => {
              try {
                const res = await fetch("/api/campaigns/difm", { method: "POST" });
                const data = await res.json();
                if (data.success) {
                  handleRefresh();
                } else {
                  alert(data.error || "Failed to create campaign");
                }
              } catch (error) {
                console.error("Error creating DIFM campaign:", error);
                alert("Failed to create campaign. Please try again.");
              }
            }}
          >
            🚀 Build Campaign For Me
          </Button>
          <Link href="/campaigns/roofing-quickstart">
            <Button
              size="sm"
              className="h-8 px-3 text-[11px] bg-neutral-100 text-neutral-900 hover:bg-neutral-200"
            >
              Roofing Quickstart
            </Button>
          </Link>
          <Link href="/campaigns/new">
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-3 text-[11px]"
            >
              New Campaign
            </Button>
          </Link>
          <Link href="/campaigns/performance">
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-3 text-[11px]"
            >
              Performance
            </Button>
          </Link>
          <Button
            size="sm"
            variant="outline"
            className="h-8 px-3 text-[11px]"
            onClick={handleRefresh}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Scope tabs */}
      <div className="inline-flex items-center gap-1 border rounded-full bg-slate-950/80 p-1 text-xs">
        <button
          className={`px-3 py-1 rounded-full ${
            scope === "my" ? "bg-slate-800 text-white" : "text-muted-foreground"
          }`}
          onClick={() => setScope("my")}
        >
          My campaigns
        </button>
        <button
          className={`px-3 py-1 rounded-full ${
            scope === "team"
              ? "bg-slate-800 text-white"
              : "text-muted-foreground"
          }`}
          onClick={() => setScope("team")}
        >
          Team campaigns
        </button>
        <button
          className={`px-3 py-1 rounded-full ${
            scope === "all"
              ? "bg-slate-800 text-white"
              : "text-muted-foreground"
          }`}
          onClick={() => setScope("all")}
        >
          All
        </button>
      </div>

      {/* Campaigns table */}
      <Card className="bg-slate-950/80 border-slate-800">
        <CardContent className="p-0">
          {loading ? (
            <p className="px-3 py-2 text-[11px] text-muted-foreground">
              Loading campaigns…
            </p>
          ) : campaigns.length === 0 ? (
            <div className="flex flex-col gap-4 rounded-2xl border border-neutral-800 bg-neutral-950/80 p-6">
              <h2 className="text-sm font-semibold text-neutral-50">
                Start with a proven roofing campaign
              </h2>
              <p className="text-xs text-neutral-400">
                Use SmartSend&apos;s Do-It-For-Me Campaign Builder to create a fully personalized, activated campaign with one click. No thinking required.
              </p>
              <div className="flex gap-2">
                <Button
                  className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-700 transition-colors"
                  onClick={async () => {
                    try {
                      const res = await fetch("/api/campaigns/difm", { method: "POST" });
                      const data = await res.json();
                      if (data.success) {
                        handleRefresh();
                      } else {
                        alert(data.error || "Failed to create campaign");
                      }
                    } catch (error) {
                      console.error("Error creating DIFM campaign:", error);
                      alert("Failed to create campaign. Please try again.");
                    }
                  }}
                >
                  🚀 Build Campaign For Me
                </Button>
                <Link
                  href="/campaigns/roofing-quickstart"
                  className="rounded-xl bg-neutral-100 px-4 py-2 text-xs font-semibold text-neutral-900 hover:bg-neutral-200 transition-colors"
                >
                  Launch Roofing Quickstart
                </Link>
                <Link
                  href="/campaigns/new"
                  className="rounded-xl border border-neutral-700 px-4 py-2 text-xs font-semibold text-neutral-100 hover:bg-neutral-900 transition-colors"
                >
                  Build from scratch
                </Link>
              </div>
            </div>
          ) : (
            <div className="max-h-[640px] overflow-y-auto text-xs">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-slate-950/70 sticky top-0 z-10">
                  <tr className="border-b border-slate-800">
                    <th className="px-3 py-2 font-medium w-[22%]">
                      Campaign
                    </th>
                    <th className="px-3 py-2 font-medium hidden md:table-cell w-[12%]">
                      Owner
                    </th>
                    <th className="px-3 py-2 font-medium w-[10%]">
                      Access
                    </th>
                    <th className="px-3 py-2 font-medium w-[10%]">
                      Status
                    </th>
                    <th
                      className="px-3 py-2 font-medium w-[8%] text-right cursor-pointer"
                      onClick={() => toggleSort("sent")}
                    >
                      Sent
                      {sortIcon("sent")}
                    </th>
                    <th
                      className="px-3 py-2 font-medium w-[8%] text-right cursor-pointer"
                      onClick={() => toggleSort("replies")}
                    >
                      Replies
                      {sortIcon("replies")}
                    </th>
                    <th
                      className="px-3 py-2 font-medium w-[8%] text-right cursor-pointer"
                      onClick={() => toggleSort("meetings")}
                    >
                      Meetings
                      {sortIcon("meetings")}
                    </th>
                    <th
                      className="px-3 py-2 font-medium w-[8%] text-right cursor-pointer"
                      onClick={() => toggleSort("reply_rate")}
                    >
                      Reply %
                      {sortIcon("reply_rate")}
                    </th>
                    <th
                      className="px-3 py-2 font-medium w-[8%] text-right cursor-pointer"
                      onClick={() => toggleSort("meeting_rate")}
                    >
                      Meeting %
                      {sortIcon("meeting_rate")}
                    </th>
                    <th
                      className="px-3 py-2 font-medium w-[10%] text-right cursor-pointer"
                      onClick={() => toggleSort("closed_won")}
                    >
                      Closed-won
                      {sortIcon("closed_won")}
                    </th>
                    <th
                      className="px-3 py-2 font-medium w-[12%] text-right cursor-pointer"
                      onClick={() => toggleSort("rev_per_thousand")}
                    >
                      Rev / 1k sends
                      {sortIcon("rev_per_thousand")}
                    </th>
                    <th
                      className="px-3 py-2 font-medium text-right hidden lg:table-cell w-[10%] cursor-pointer"
                      onClick={() => toggleSort("created_at")}
                    >
                      Created
                      {sortIcon("created_at")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedCampaigns.map(
                    ({
                      campaign,
                      sent,
                      replies,
                      meetings,
                      closedWonCents,
                      replyRate,
                      meetingRate,
                      revPerThousand,
                    }) => {
                      const closedWonLabel =
                        closedWonCents > 0
                          ? formatMoney(closedWonCents / 100)
                          : "—";
                      const revPerThousandLabel =
                        revPerThousand > 0
                          ? formatMoney(revPerThousand)
                          : "—";
                      
                      const isOwner = currentUserId && campaign.created_by === currentUserId;
                      const ownerName =
                        campaign.profiles?.full_name ||
                        (isOwner ? "You" : "Unknown");

                      return (
                        <tr
                          key={campaign.id}
                          className="border-b border-slate-900/80 hover:bg-slate-950/70 cursor-pointer"
                        >
                          <td className="px-3 py-2 align-top">
                            <Link
                              href={`/campaigns/${campaign.id}`}
                              className="font-semibold line-clamp-2 hover:underline"
                            >
                              {campaign.name || "(Untitled campaign)"}
                            </Link>
                          </td>
                          <td className="px-3 py-2 align-top hidden md:table-cell text-sm">
                            {ownerName}
                            {isOwner && (
                              <span className="ml-1 text-[10px] text-muted-foreground">
                                (Owner)
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 align-top">
                            <Badge
                              variant={campaign.is_shared ? "outline" : "secondary"}
                              className="text-xs"
                            >
                              {campaign.is_shared ? "Shared" : "Private"}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 align-top">
                            <span className="text-[11px] text-muted-foreground">
                              {campaign.status || "Draft"}
                            </span>
                          </td>
                          <td className="px-3 py-2 align-top text-right">
                            {sent}
                          </td>
                          <td className="px-3 py-2 align-top text-right">
                            {replies}
                          </td>
                          <td className="px-3 py-2 align-top text-right">
                            {meetings}
                          </td>
                          <td className="px-3 py-2 align-top text-right">
                            {sent > 0 ? formatPercent(replyRate) : "—"}
                          </td>
                          <td className="px-3 py-2 align-top text-right">
                            {sent > 0 ? formatPercent(meetingRate) : "—"}
                          </td>
                          <td className="px-3 py-2 align-top text-right">
                            {closedWonLabel}
                          </td>
                          <td className="px-3 py-2 align-top text-right">
                            {revPerThousandLabel}
                          </td>
                          <td className="px-3 py-2 align-top text-right hidden lg:table-cell">
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(
                                campaign.created_at
                              ).toLocaleDateString()}
                            </span>
                          </td>
                        </tr>
                      );
                    }
                  )}
                </tbody>
              </table>
              {loadingOutcomes && (
                <p className="px-3 py-2 text-[10px] text-muted-foreground">
                  Updating campaign outcomes…
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}








