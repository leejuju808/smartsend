"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { OverviewCards } from "./OverviewCards";
import { CampaignTable, type CampaignSortKey } from "./CampaignTable";
import { BenchmarksBar } from "./BenchmarksBar";

type SortKey =
  | "reply_rate"
  | "campaign_name"
  | "sends"
  | "replies"
  | "opens"
  | "bounces"
  | "send_delta"
  | "reply_delta"
  | "reply_rate_delta"
  | "last_activity";

export default function AnalyticsOverviewPage() {
  const [days, setDays] = React.useState(7);
  const [sort, setSort] = React.useState<SortKey>("reply_rate");
  const [dir, setDir] = React.useState<"asc" | "desc">("desc");
  const [limit, setLimit] = React.useState(25);
  const [offset, setOffset] = React.useState(0);
  const [overview, setOverview] = React.useState<any>(null);
  const [kpis, setKpis] = React.useState<any>(null);
  const [benchmarks, setBenchmarks] = React.useState<any | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const query = new URLSearchParams({
          days: String(days),
          sort,
          dir,
          limit: String(limit),
          offset: String(offset),
        });
        const [overviewRes, kpiRes, benchRes] = await Promise.all([
          fetch(`/api/analytics/overview/list?${query.toString()}`).then((r) => r.json()),
          fetch(`/api/analytics/overview?days=${days}`).then((r) => r.json()),
          fetch(`/api/analytics/benchmarks?days=${days}`).then((r) => r.json().catch(() => ({}))),
        ]);
        if (!cancelled) {
          setOverview(overviewRes);
          setKpis(kpiRes);
          setBenchmarks(benchRes?.benchmarks ?? null);
        }
      } catch (err) {
        if (!cancelled) {
          console.error(err);
          setOverview(null);
          setKpis(null);
          setBenchmarks(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [days, sort, dir, limit, offset]);

  const total = overview?.total ?? 0;
  const page = Math.floor(offset / limit) + 1;
  const pages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">All Campaigns</h1>
        <div className="flex items-center gap-2">
          <select
            className="h-8 rounded-md border px-2 text-sm"
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as SortKey);
              setOffset(0);
            }}
          >
            {[
              "reply_rate",
              "sends",
              "replies",
              "opens",
              "bounces",
              "send_delta",
              "reply_delta",
              "reply_rate_delta",
              "campaign_name",
              "last_activity",
            ].map((k) => (
              <option key={k} value={k}>
                {k.replaceAll("_", " ")}
              </option>
            ))}
          </select>
          <select
            className="h-8 rounded-md border px-2 text-sm"
            value={dir}
            onChange={(e) => {
              setDir(e.target.value as "asc" | "desc");
              setOffset(0);
            }}
          >
            <option value="desc">desc</option>
            <option value="asc">asc</option>
          </select>
          {[7, 14, 30, 60, 90].map((n) => (
            <Button
              key={n}
              size="sm"
              variant={days === n ? "default" : "outline"}
              onClick={() => {
                setDays(n);
                setOffset(0);
              }}
            >
              {n}d
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border p-6 text-sm text-muted-foreground">Loading…</div>
      ) : (
        <>
          <OverviewCards data={kpis} />
          <BenchmarksBar days={days} initial={benchmarks} />
          <CampaignTable
            rows={overview?.rows ?? []}
            sortKey={sort as CampaignSortKey}
            sortDir={dir}
            onSortChange={(key, direction) => {
              setSort(key as SortKey);
              setDir(direction);
              setOffset(0);
            }}
          />
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Showing {total === 0 ? 0 : offset + 1}–{Math.min(offset + limit, total)} of {total}
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setOffset(Math.max(0, offset - limit))}
                disabled={page <= 1}
              >
                Prev
              </Button>
              <div className="text-sm">
                Page {page} / {pages}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setOffset(Math.min((pages - 1) * limit, offset + limit))}
                disabled={page >= pages}
              >
                Next
              </Button>
              <select
                className="h-8 rounded-md border px-2 text-sm"
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setOffset(0);
                }}
              >
                {[10, 25, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n}/page
                  </option>
                ))}
              </select>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

