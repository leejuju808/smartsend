"use client";

import { Badge } from "@/components/ui/badge";

// Simple date formatting fallback
function formatDistanceToNow(date: Date | string): string {
  try {
    const { formatDistanceToNow: fn } = require("date-fns");
    return fn(new Date(date), { addSuffix: true });
  } catch {
    const now = new Date();
    const then = new Date(date);
    const diffMs = now.getTime() - then.getTime();
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;
    return then.toLocaleDateString();
  }
}

interface CampaignHistoryEntry {
  campaign_id: string;
  campaign_name: string;
  step: number | null;
  status: string;
  replied: boolean;
  reply_date: string | null;
  variant: string | null;
  sent_at: string;
}

interface CampaignHistoryProps {
  history: CampaignHistoryEntry[];
}

export function CampaignHistory({ history }: CampaignHistoryProps) {
  if (!history || history.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Campaign History</h2>
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3 text-sm font-semibold">Campaign</th>
              <th className="text-left p-3 text-sm font-semibold">Step</th>
              <th className="text-left p-3 text-sm font-semibold">Status</th>
              <th className="text-left p-3 text-sm font-semibold">Replied</th>
              <th className="text-left p-3 text-sm font-semibold">Reply Date</th>
              <th className="text-left p-3 text-sm font-semibold">Variant</th>
            </tr>
          </thead>
          <tbody>
            {history.map((entry, idx) => (
              <tr
                key={`${entry.campaign_id}-${idx}`}
                className="border-t hover:bg-muted/30"
              >
                <td className="p-3 text-sm">{entry.campaign_name}</td>
                <td className="p-3 text-sm">
                  {entry.step !== null ? `${entry.step}/5` : "-"}
                </td>
                <td className="p-3">
                  <Badge variant="outline" className="text-xs">
                    {entry.status}
                  </Badge>
                </td>
                <td className="p-3">
                  {entry.replied ? (
                    <Badge variant="default" className="text-xs bg-green-500">
                      Yes
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs">
                      No
                    </Badge>
                  )}
                </td>
                <td className="p-3 text-sm text-muted-foreground">
                  {entry.reply_date
                    ? formatDistanceToNow(new Date(entry.reply_date), {
                        addSuffix: true,
                      })
                    : "-"}
                </td>
                <td className="p-3 text-sm text-muted-foreground">
                  {entry.variant ? entry.variant.slice(0, 8) + "…" : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

