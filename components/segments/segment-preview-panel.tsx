"use client";

import * as React from "react";
import { getSegmentPreview } from "@/app/api/segments/preview/actions";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { SegmentCondition } from "@/lib/segments/schema";

interface SegmentPreviewPanelProps {
  accountId: string;
  conditions: SegmentCondition[];
}

type PreviewResult = {
  total: number;
  sample: {
    id: string;
    email: string | null;
    company: string | null;
    title: string | null;
    city: string | null;
    country: string | null;
  }[];
};

export function SegmentPreviewPanel({ accountId, conditions }: SegmentPreviewPanelProps) {
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<PreviewResult | null>(null);

  React.useEffect(() => {
    if (!conditions || conditions.length === 0) {
      setResult(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const timeout = setTimeout(async () => {
      try {
        const data = await getSegmentPreview({
          account_id: accountId,
          conditions: conditions.map((c) => ({
            field: c.field,
            op: c.op,
            value: c.value,
          })),
        });

        if (!cancelled) {
          setResult(data as PreviewResult);
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          toast.error("Failed to load segment preview");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 400); // debounce a bit while typing

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [accountId, JSON.stringify(conditions)]);

  return (
    <div className="space-y-2 rounded-xl border bg-muted/40 px-3 py-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Live preview</p>
        {loading && (
          <span className="inline-flex items-center text-xs text-muted-foreground">
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            Calculating…
          </span>
        )}
      </div>

      {!conditions.length && (
        <p className="text-xs text-muted-foreground">
          Add at least one condition to see how many leads match.
        </p>
      )}

      {conditions.length > 0 && result && (
        <div className="space-y-2">
          <p className="text-xs">
            This segment currently matches{" "}
            <span className="font-semibold">{result.total}</span> leads. Showing up to{" "}
            <span className="font-semibold">50</span> below.
          </p>

          {result.sample.length === 0 ? (
            <p className="text-xs text-red-500">
              0 leads match these conditions. Try widening your filters.
            </p>
          ) : (
            <div className="max-h-64 overflow-auto rounded-lg border bg-background">
              <table className="min-w-full text-xs">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-2 py-1 text-left font-semibold">Email</th>
                    <th className="px-2 py-1 text-left font-semibold">Company</th>
                    <th className="px-2 py-1 text-left font-semibold">Title</th>
                    <th className="px-2 py-1 text-left font-semibold">Location</th>
                  </tr>
                </thead>
                <tbody>
                  {result.sample.map((lead) => (
                    <tr key={lead.id} className="border-t">
                      <td className="px-2 py-1">{lead.email ?? "—"}</td>
                      <td className="px-2 py-1">{lead.company ?? "—"}</td>
                      <td className="px-2 py-1">{lead.title ?? "—"}</td>
                      <td className="px-2 py-1">
                        {[lead.city, lead.country].filter(Boolean).join(", ") || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


