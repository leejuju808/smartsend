"use client";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

interface VariantPerformanceRow {
  variant_id: string | null;
  variant_label: string | null;
  template_id: string | null;
  template_name: string | null;
  org_id: string;
  sends: number;
  replies: number;
  reply_rate_pct: number | null;
  first_send_at: string | null;
  last_send_at: string | null;
}

export default function VariantPerformanceCard() {
  const [rows, setRows] = useState<VariantPerformanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);
      const r = await fetch("/api/variants/performance");
      if (!r.ok) {
        throw new Error(`Failed to fetch: ${r.statusText}`);
      }
      const data = await r.json();
      setRows(data || []);
    } catch (e: any) {
      setError(e.message || "Failed to load variant performance");
      console.error("Error fetching variant performance:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <Card className="rounded-2xl">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold">A/B Variant Performance</h3>
          <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
            {loading ? "Loading..." : "Refresh"}
          </Button>
        </div>

        {error && (
          <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
            {error}
          </div>
        )}

        {loading && rows.length === 0 ? (
          <div className="text-sm text-gray-500 py-4">Loading variant performance...</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-gray-500 py-4">No variant performance data yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b">
                  <th className="p-2 font-medium">Template</th>
                  <th className="p-2 font-medium">Variant</th>
                  <th className="p-2 font-medium text-right">Sends</th>
                  <th className="p-2 font-medium text-right">Replies</th>
                  <th className="p-2 font-medium text-right">Reply Rate</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b hover:bg-gray-50">
                    <td className="p-2">{r.template_name || "—"}</td>
                    <td className="p-2">{r.variant_label || "—"}</td>
                    <td className="p-2 text-right">{r.sends}</td>
                    <td className="p-2 text-right">{r.replies}</td>
                    <td className="p-2 text-right font-medium">
                      {r.reply_rate_pct !== null ? `${r.reply_rate_pct}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

