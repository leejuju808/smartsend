"use client";

import * as React from "react";
import {
  getSegmentPreview,
  type SegmentPreview,
} from "@/app/api/segments/preview/actions";
import { Card } from "@/components/ui/card";
import { Loader2, Target, Users } from "lucide-react";

interface CampaignTargetPreviewProps {
  accountId: string;
  campaignId: string;
  segmentId: string | null;
}

export function CampaignTargetPreview({
  accountId,
  campaignId,
  segmentId,
}: CampaignTargetPreviewProps) {
  const [data, setData] = React.useState<SegmentPreview | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!segmentId) {
      setData(null);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    getSegmentPreview(accountId, segmentId)
      .then((res) => {
        if (cancelled) return;
        setData(res);
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) {
          setError("Failed to load segment preview");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [accountId, campaignId, segmentId]);

  if (!segmentId) {
    return (
      <Card className="flex items-center justify-between border-dashed bg-muted/40 px-3 py-2">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-xs font-medium">Target audience</p>
            <p className="text-[11px] text-muted-foreground">
              No segment attached yet. Attach a segment to see target size.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="border bg-background px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          <div>
            <p className="text-xs font-medium">Segment target preview</p>
            <p className="text-[11px] text-muted-foreground">
              Based on the attached segment and current lead data.
            </p>
          </div>
        </div>
        {loading && (
          <span className="inline-flex items-center text-[11px] text-muted-foreground">
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            Updating…
          </span>
        )}
      </div>

      {error && (
        <p className="mt-2 text-[11px] text-red-600">
          {error}
        </p>
      )}

      {data && (
        <>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            <div className="rounded-lg border bg-card px-2 py-1.5">
              <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Users className="h-3 w-3" /> Total matching leads
              </p>
              <p className="mt-1 text-lg font-semibold">{data.total}</p>
            </div>
            <div className="rounded-lg border bg-card px-2 py-1.5">
              <p className="text-[11px] text-muted-foreground">Sample size</p>
              <p className="mt-1 text-sm font-semibold">
                {data.sample.length} shown
              </p>
            </div>
            <div className="rounded-lg border bg-card px-2 py-1.5">
              <p className="text-[11px] text-muted-foreground">
                Note
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Launch uses the same segment filter helper as this preview.
              </p>
            </div>
          </div>

          {data.sample.length > 0 && (
            <div className="mt-3 rounded-lg border bg-card/60">
              <div className="border-b px-3 py-1.5">
                <p className="text-[11px] font-medium text-muted-foreground">
                  Sample leads
                </p>
              </div>
              <div className="max-h-48 overflow-auto">
                <table className="min-w-full text-[11px]">
                  <thead className="sticky top-0 bg-muted">
                    <tr>
                      <th className="px-3 py-1 text-left font-semibold">Lead</th>
                      <th className="px-3 py-1 text-left font-semibold">
                        Company / Title
                      </th>
                      <th className="px-3 py-1 text-left font-semibold">
                        Location
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.sample.map((l) => (
                      <tr key={l.id} className="border-t">
                        <td className="px-3 py-1 align-top">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium">
                              {[l.first_name, l.last_name]
                                .filter(Boolean)
                                .join(" ") || "Unnamed"}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {l.email || "no-email@example.com"}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-1 align-top">
                          <div className="flex flex-col gap-0.5">
                            <span className="truncate max-w-[180px]">
                              {l.company || "—"}
                            </span>
                            <span className="text-[10px] text-muted-foreground truncate max-w-[180px]">
                              {l.title || "—"}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-1 align-top">
                          <span className="text-[10px] text-muted-foreground">
                            {[l.city, l.country].filter(Boolean).join(", ") || "—"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

