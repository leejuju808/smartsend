"use client";

import * as React from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spark } from "./Spark";

function DeltaPill({ v }: { v: number }) {
  const pos = v > 0;
  const zero = v === 0;
  const cls = zero ? "bg-muted text-muted-foreground" : pos ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700";
  return <span className={`rounded-full px-2 py-0.5 text-xs ${cls}`}>{pos ? `+${v}` : v}</span>;
}

function RatePill({ v }: { v: number }) {
  const pos = v > 0;
  const zero = v === 0;
  const cls = zero ? "bg-muted text-muted-foreground" : pos ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700";
  const vv = `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;
  return <span className={`rounded-full px-2 py-0.5 text-xs ${cls}`}>{vv}</span>;
}

type Row = {
  campaign_id: string;
  campaign_name: string;
  sends: number;
  replies: number;
  reply_rate: number;
  opens: number;
  bounces: number;
  send_delta: number;
  reply_delta: number;
  reply_rate_delta: number;
  last_activity: string | null;
};

type Rank = {
  campaign_id: string;
  sends_rank?: number;
  reply_rate_rank?: number;
};

type Sparks = Record<string, Array<{ d: string; sends: number; replies: number }>>;

export type CampaignSortKey = keyof Row;

type CampaignTableProps = {
  rows: Row[];
  ranks?: Rank[];
  sortKey?: CampaignSortKey;
  sortDir?: "asc" | "desc";
  onSortChange?: (key: CampaignSortKey, dir: "asc" | "desc") => void;
};

export function CampaignTable({ rows, ranks, sortKey, sortDir, onSortChange }: CampaignTableProps) {
  const controlled = typeof onSortChange === "function";
  const [internalSortKey, setInternalSortKey] = React.useState<CampaignSortKey>("reply_rate");
  const [internalSortDir, setInternalSortDir] = React.useState<"asc" | "desc">("desc");
  const [sparks, setSparks] = React.useState<Sparks>({});

  const rankMap = React.useMemo(() => {
    if (!ranks?.length) return new Map<string, Rank>();
    return new Map(ranks.map((r) => [r.campaign_id, r]));
  }, [ranks]);

  React.useEffect(() => {
    if (!rows?.length) {
      setSparks({});
      return;
    }

    const ids = rows.map((r) => r.campaign_id).join(",");
    fetch(`/api/analytics/overview/sparks?ids=${ids}&days=14`)
      .then((r) => r.json())
      .then((j) => setSparks(j.series ?? {}))
      .catch(() => setSparks({}));
  }, [rows]);

  const activeSortKey = controlled ? (sortKey ?? "reply_rate") : internalSortKey;
  const activeSortDir = controlled ? (sortDir ?? "desc") : internalSortDir;

  function sortBy(k: keyof Row) {
    if (controlled) {
      const nextDir = k === activeSortKey ? (activeSortDir === "asc" ? "desc" : "asc") : "desc";
      onSortChange?.(k, nextDir);
      return;
    }
    if (k === internalSortKey) {
      setInternalSortDir(internalSortDir === "asc" ? "desc" : "asc");
    } else {
      setInternalSortKey(k);
      setInternalSortDir("desc");
    }
  }

  const sorted = React.useMemo(() => {
    if (controlled) {
      return rows ?? [];
    }
    return [...(rows ?? [])].sort((a, b) => {
      const va = (a[internalSortKey] ?? 0) as any;
      const vb = (b[internalSortKey] ?? 0) as any;
      if (va === vb) return 0;
      return (va > vb ? 1 : -1) * (internalSortDir === "asc" ? 1 : -1);
    });
  }, [controlled, rows, internalSortKey, internalSortDir]);

  function Th({ k, children, right = false }: { k: keyof Row; children: React.ReactNode; right?: boolean }) {
    const active = activeSortKey === k;
    return (
      <th
        onClick={() => sortBy(k)}
        className={`px-3 py-2 ${right ? "text-right" : "text-left"} cursor-pointer select-none`}
      >
        {children}
        {active ? (activeSortDir === "asc" ? " ↑" : " ↓") : ""}
      </th>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40">
          <tr>
            <Th k="campaign_name">Campaign</Th>
            <th className="px-3 py-2">Spark</th>
            <Th k="sends" right>
              Sends
            </Th>
            <Th k="replies" right>
              Replies
            </Th>
            <Th k="reply_rate" right>
              Reply&nbsp;Rate
            </Th>
            <Th k="opens" right>
              Opens
            </Th>
            <Th k="bounces" right>
              Bounces
            </Th>
            <Th k="send_delta" right>
              Δ Sends
            </Th>
            <Th k="reply_delta" right>
              Δ Replies
            </Th>
            <Th k="reply_rate_delta" right>
              Δ Reply&nbsp;Rate
            </Th>
            <Th k="last_activity" right>
              Last Active
            </Th>
            <th className="px-3 py-2 text-right">Export</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const rank = rankMap.get(r.campaign_id);
            return (
            <tr key={r.campaign_id} className="border-t">
              <td className="px-3 py-2">
                <Link href={`/campaign/${r.campaign_id}/analytics`} className="font-medium hover:underline">
                  {r.campaign_name}
                </Link>
                {rank && (
                  <>
                    {typeof rank.reply_rate_rank === "number" && (
                      <span className="ml-2 rounded-full bg-muted px-1.5 py-0.5 text-[10px]">
                        RR #{rank.reply_rate_rank}
                      </span>
                    )}
                    {typeof rank.sends_rank === "number" && (
                      <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px]">
                        Sends #{rank.sends_rank}
                      </span>
                    )}
                  </>
                )}
              </td>
              <td className="px-3 py-2">
                <Spark points={sparks[r.campaign_id] ?? []} k="sends" />
              </td>
              <td className="px-3 py-2 text-right">{r.sends}</td>
              <td className="px-3 py-2 text-right">{r.replies}</td>
              <td className="px-3 py-2 text-right">{r.reply_rate?.toFixed?.(2) ?? r.reply_rate}%</td>
              <td className="px-3 py-2 text-right">{r.opens}</td>
              <td className="px-3 py-2 text-right">{r.bounces}</td>
              <td className="px-3 py-2 text-right">
                <DeltaPill v={r.send_delta ?? 0} />
              </td>
              <td className="px-3 py-2 text-right">
                <DeltaPill v={r.reply_delta ?? 0} />
              </td>
              <td className="px-3 py-2 text-right">
                <RatePill v={r.reply_rate_delta ?? 0} />
              </td>
              <td className="px-3 py-2 text-right">
                {r.last_activity ? new Date(r.last_activity).toLocaleDateString() : "—"}
              </td>
              <td className="px-3 py-2 text-right">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    window.open(`/api/campaign/${r.campaign_id}/analytics/export?days=30`, "_blank")
                  }
                >
                  <Download className="mr-1 h-4 w-4" /> CSV
                </Button>
              </td>
            </tr>
          );
          })}
          {(!rows || rows.length === 0) && (
            <tr>
              <td className="px-3 py-6 text-center text-muted-foreground" colSpan={12}>
                No campaigns yet. Create one to see performance here.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

