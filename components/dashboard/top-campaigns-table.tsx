// components/dashboard/top-campaigns-table.tsx
"use client";

import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type MetricRow = {
  campaign_id: string;
  campaign_name: string;
  campaign_created_at: string;
  total_sent: number;
  total_delivered: number;
  unique_opens: number;
  unique_clicks: number;
  unique_replies: number;
  total_bounces: number;
  open_rate: number;
  click_rate: number;
  reply_rate: number;
};

type Props = {
  workspaceSlug: string;
  rows: MetricRow[];
};

export function TopCampaignsTable({ workspaceSlug, rows }: Props) {
  // Only campaigns with at least some sends
  const active = rows.filter((r) => r.total_sent > 0);

  // Sort by reply_rate desc, then by total_sent desc
  const sorted = [...active].sort((a, b) => {
    if ((b.reply_rate || 0) !== (a.reply_rate || 0)) {
      return (b.reply_rate || 0) - (a.reply_rate || 0);
    }
    return (b.total_sent || 0) - (a.total_sent || 0);
  });

  const top = sorted.slice(0, 10);

  const pct = (x: number) => `${Math.round((x || 0) * 100)}%`;

  return (
    <div className="rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Campaign</TableHead>
            <TableHead className="hidden md:table-cell">
              Sent
            </TableHead>
            <TableHead>Open</TableHead>
            <TableHead>Click</TableHead>
            <TableHead>Reply</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {top.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={5}
                className="py-6 text-center text-sm text-muted-foreground"
              >
                No campaign activity yet. Start a campaign to see
                analytics here.
              </TableCell>
            </TableRow>
          ) : (
            top.map((r) => (
              <TableRow key={r.campaign_id}>
                <TableCell>
                  <div className="flex flex-col">
                    <Link
                      href={`/app/${workspaceSlug}/campaigns/${r.campaign_id}`}
                      className="text-sm font-medium hover:underline"
                    >
                      {r.campaign_name}
                    </Link>
                    <span className="text-[11px] text-muted-foreground">
                      Created:{" "}
                      {new Date(
                        r.campaign_created_at
                      ).toLocaleDateString()}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell text-sm">
                  {r.total_sent}
                </TableCell>
                <TableCell className="text-xs">
                  {pct(r.open_rate)}
                </TableCell>
                <TableCell className="text-xs">
                  {pct(r.click_rate)}
                </TableCell>
                <TableCell className="text-xs">
                  {pct(r.reply_rate)}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
































































