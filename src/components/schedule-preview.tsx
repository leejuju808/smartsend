"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { createBrowserClient } from "@/lib/supabase/client";

type SchedulePreviewProps = {
  campaignId: string;
  stepNo: number;
  leadIds: string[];
  startAtIso: string | null | undefined;
  businessHours: boolean;
  windowStart: string;
  windowEnd: string;
  days: number[];
  skipHolidays: boolean;
};

type PreviewRow = {
  lead_id: string;
  email: string;
  tz: string;
  country: string | null;
  local_window: string;
  local_start: string;
  local_due: string;
  dow: number;
};

const dayNames = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function SchedulePreview({
  campaignId,
  stepNo,
  leadIds,
  startAtIso,
  businessHours,
  windowStart,
  windowEnd,
  days,
  skipHolidays,
}: SchedulePreviewProps) {
  const [rows, setRows] = useState<PreviewRow[] | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const supabase = useMemo(() => createBrowserClient(), []);

  async function load() {
    if (!open) return;
    if (!campaignId) {
      setError("Campaign required");
      setLoading(false);
      return;
    }
    if (!leadIds.length) {
      setRows([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const { data, error } = await supabase.rpc("preview_schedule_for_leads", {
      p_campaign: campaignId,
      p_step_no: stepNo,
      p_leads: leadIds,
      p_start_at: startAtIso || null,
      p_business_hours: businessHours,
      p_window_start: windowStart,
      p_window_end: windowEnd,
      p_days: days,
      p_skip_holidays: skipHolidays,
    });
    if (error) {
      setError(error.message);
      setRows([]);
    } else {
      setRows((data as PreviewRow[]) ?? []);
    }
    setLoading(false);
  }

  function formatLocalDue(row: PreviewRow) {
    if (!row.local_due) return "—";
    const date = new Date(row.local_due);
    return date.toLocaleString([], { timeZone: row.tz || "UTC" });
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, campaignId, stepNo, startAtIso, businessHours, windowStart, windowEnd, skipHolidays, supabase, JSON.stringify(days), JSON.stringify(leadIds)]);

  return (
    <div>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} disabled={loading}>
        {loading ? "Loading…" : "Preview (per lead)"}
      </Button>
      {open && (
        <div className="fixed inset-0 bg-black/40 z-50 grid place-items-center">
          <div className="bg-background rounded-2xl p-4 w-[960px] max-h-[80vh] overflow-auto shadow-xl">
            <div className="flex items-center justify-between mb-2">
              <div className="text-lg font-semibold">Schedule Preview</div>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Close
              </Button>
            </div>
            <div className="text-xs text-muted-foreground mb-2">All times shown in each lead’s local timezone.</div>
            {error ? <div className="text-sm text-red-500 mb-2">{error}</div> : null}
            <div className="overflow-auto rounded-2xl border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left">
                    <th className="py-2 px-2">Email</th>
                    <th className="px-2">TZ</th>
                    <th className="px-2">Country</th>
                    <th className="px-2">Window</th>
                    <th className="px-2">Local Due</th>
                    <th className="px-2">DOW</th>
                  </tr>
                </thead>
                <tbody>
                  {(rows ?? []).map((row) => (
                    <tr key={row.lead_id} className="border-t">
                      <td className="py-2 px-2">{row.email}</td>
                      <td className="px-2">{row.tz}</td>
                      <td className="px-2">{row.country || "—"}</td>
                      <td className="px-2">{row.local_window}</td>
                      <td className="px-2">{formatLocalDue(row)}</td>
                      <td className="px-2">{dayNames[row.dow] ?? "—"}</td>
                    </tr>
                  ))}
                  {rows && rows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-2 py-4 text-center text-sm text-muted-foreground">
                        No leads to preview.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex justify-end">
              <Button onClick={() => setOpen(false)}>Looks good</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

