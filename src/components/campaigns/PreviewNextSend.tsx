"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Switch } from "@/components/ui/switch";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

export default function PreviewNextSend({ campaignId, stepNo }: { campaignId: string; stepNo: number }) {
  const [rows, setRows] = useState<any[]>([]);
  const [jitter, setJitter] = useState(true);
  const [loading, setLoading] = useState(false);
  const supabase = createClientComponentClient();

  async function run() {
    setLoading(true);
    try {
      // Pull a few most recent leads tied to this campaign
      const { data: leadsData } = await supabase
        .from("campaign_members")
        .select("lead_id, leads:lead_id(id, email)")
        .eq("campaign_id", campaignId)
        .limit(20);

      const leadIds = (leadsData ?? []).map((x: any) => x.lead_id).filter(Boolean);
      
      if (leadIds.length === 0) {
        setRows([]);
        setLoading(false);
        return;
      }

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch(`${supabaseUrl}/functions/v1/preview-next-send`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify({
          campaign_id: campaignId,
          step_no: stepNo,
          lead_ids: leadIds,
          include_jitter: jitter,
        }),
      }).then((r) => r.json());

      if (res.ok) {
        setRows(res.rows ?? []);
      } else {
        console.error("Preview error:", res.error);
        setRows([]);
      }
    } catch (error) {
      console.error("Error running preview:", error);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jitter, campaignId, stepNo]);

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="font-medium">Preview next send (local quiet hours per lead)</div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Jitter</span>
          <Switch checked={jitter} onCheckedChange={setJitter} />
          <Button size="sm" onClick={run} disabled={loading}>
            {loading ? "…" : "Refresh"}
          </Button>
        </div>
      </div>
      <div className="text-xs text-muted-foreground">
        Shows the exact UTC timestamp we'll schedule for each lead, using their timezone and step window.
      </div>
      <div className="max-h-80 overflow-auto text-sm">
        <table className="w-full">
          <thead className="text-left text-xs">
            <tr>
              <th className="p-2">Lead</th>
              <th className="p-2">TZ</th>
              <th className="p-2">Scheduled (UTC)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: any) => (
              <tr key={r.lead_id} className="border-t">
                <td className="py-1 px-2">{r.lead_id}</td>
                <td className="px-2">{r.tz}</td>
                <td className="px-2">{new Date(r.scheduled_at).toLocaleString()}</td>
              </tr>
            ))}
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={3} className="py-4 text-center text-muted-foreground">
                  No data.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

