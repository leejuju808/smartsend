"use client";
import useSWR from "swr";
import { useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Table, THead, TR, TH, TBody, TD } from "@/components/ui/table";
import { Input } from "@/components/ui/Input";

export function SchedulerPreview({
  accountId, campaignId, stepNo
}: { accountId: string; campaignId: string; stepNo: number }) {
  const [limit, setLimit] = useState(200);
  const { data, isLoading, mutate } = useSWR(
    `/api/scheduler/preview?account_id=${accountId}&campaign_id=${campaignId}&step=${stepNo}&limit=${limit}`,
    (u)=>fetch(u).then(r=>r.json()),
    { refreshInterval: 15000 }
  );
  const rows = data?.rows ?? [];

  const stats = useMemo(()=>{
    const total = rows.length;
    const blocked = rows.filter((r:any)=>r.allowed === false).length;
    const sched   = rows.filter((r:any)=>r.allowed === true && r.scheduled_at).length;
    return { total, blocked, sched };
  }, [rows]);

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="font-medium">Send Forecast — Step {stepNo}</div>
        <div className="text-xs text-muted-foreground">
          {stats.sched}/{stats.total - stats.blocked} eligible will start at their shown times · {stats.blocked} blocked
        </div>
      </div>

      <div className="flex gap-2">
        <Input className="w-28" type="number" value={limit} onChange={e=>setLimit(Number(e.target.value||200))} />
        <Button variant="outline" onClick={()=>mutate()}>Refresh</Button>
      </div>

      <div className="rounded-md border overflow-x-auto">
        <Table>
          <THead>
            <TR>
              <TH>Queue ID</TH>
              <TH>Lead</TH>
              <TH>Status</TH>
              <TH>Reason</TH>
              <TH>Scheduled At (UTC)</TH>
            </TR>
          </THead>
          <TBody>
            {isLoading && (
              <TR>
                <TD colSpan={5} className="text-sm text-muted-foreground">Loading...</TD>
              </TR>
            )}
            {!isLoading && rows.map((r:any)=>(
              <TR key={r.queue_id ?? r.lead_id}>
                <TD className="text-xs">{r.queue_id ?? "—"}</TD>
                <TD className="text-xs">{r.lead_id}</TD>
                <TD className="text-xs">
                  {r.allowed ? <span className="text-green-600">eligible</span> : <span className="text-red-600">blocked</span>}
                </TD>
                <TD className="text-xs">{r.reason ?? "—"}</TD>
                <TD className="text-xs">{r.scheduled_at ? new Date(r.scheduled_at).toLocaleString() : "—"}</TD>
              </TR>
            ))}
            {!isLoading && rows.length===0 && (
              <TR>
                <TD colSpan={5} className="text-sm text-muted-foreground">No rows</TD>
              </TR>
            )}
          </TBody>
        </Table>
      </div>
    </Card>
  );
}

