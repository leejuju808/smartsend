"use client";

import useSWR from "swr";
import { Card } from "@/components/ui/Card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";

function MiniUser({ p }:{ p?:{ id:string; full_name:string|null; email:string|null; avatar_url:string|null } }) {
  if (!p) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex items-center gap-2">
      {p.avatar_url ? <img src={p.avatar_url} alt="" className="h-5 w-5 rounded-full" /> : null}
      <div className="flex flex-col">
        <span className="text-xs">{p.full_name || p.email || p.id?.slice(0,8)}</span>
        {p.email ? <span className="text-[10px] text-muted-foreground">{p.email}</span> : null}
      </div>
    </div>
  );
}

export function CampaignMemberAudit({ campaignId }:{ campaignId:string }) {
  const { data } = useSWR(
    `/api/campaign-members/audit?campaign=${campaignId}`,
    (u)=>fetch(u, { credentials:"include" }).then(r=>r.json()),
    { refreshInterval: 20000 }
  );
  const rows = data?.rows ?? [];

  return (
    <Card className="p-4 space-y-4">
      <div className="font-medium">Access Audit</div>
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <THead>
            <TR>
              <TH>When</TH>
              <TH>Actor</TH>
              <TH>Action</TH>
              <TH>Target</TH>
              <TH>Change</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((r:any)=>(
              <TR key={r.id}>
                <TD className="text-xs">{new Date(r.at).toLocaleString()}</TD>
                <TD><MiniUser p={r.actor_profile} /></TD>
                <TD className="text-xs capitalize">{r.action.replace('_',' ')}</TD>
                <TD><MiniUser p={r.target_profile} /></TD>
                <TD className="text-xs">
                  {r.old_role || '—'} → {r.new_role || '—'}
                </TD>
              </TR>
            ))}
            {rows.length===0 && (
              <TR><TD colSpan={5} className="text-sm text-muted-foreground">No audit events yet.</TD></TR>
            )}
          </TBody>
        </Table>
      </div>
    </Card>
  );
}

