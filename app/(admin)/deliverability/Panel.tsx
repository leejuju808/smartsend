"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type MetricRow = {
  account_id: string | null;
  delivered: number;
  opens: number;
  clicks: number;
  bounces: number;
  complaints: number;
  unsubscribes: number;
  email?: string;
  provider?: string;
};

type DomainRow = {
  domain: string;
  reason: string;
  expires_at: string | null;
};

export default function DeliverabilityPanel() {
  const [rows, setRows] = React.useState<MetricRow[]>([]);
  const [domains, setDomains] = React.useState<DomainRow[]>([]);

  React.useEffect(() => {
    (async () => {
      const agg = await fetch("/api/deliverability/7d");
      const blk = await fetch("/api/deliverability/blocklists");
      if (agg.ok) setRows(await agg.json());
      if (blk.ok) setDomains(await blk.json());
    })();
  }, []);

  return (
    <div className="grid gap-6">
      <Card className="rounded-2xl">
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold">Deliverability (7d)</h3>
          <div className="overflow-x-auto mt-3">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Delivered</TableHead>
                  <TableHead>Open%</TableHead>
                  <TableHead>Click%</TableHead>
                  <TableHead>Bounce%</TableHead>
                  <TableHead>Complaints</TableHead>
                  <TableHead>Unsubs</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, idx) => {
                  const open = r.delivered ? ((100 * (r.opens ?? 0)) / r.delivered).toFixed(1) : "0.0";
                  const click = r.delivered ? ((100 * (r.clicks ?? 0)) / r.delivered).toFixed(1) : "0.0";
                  const bounce = r.delivered ? ((100 * (r.bounces ?? 0)) / r.delivered).toFixed(2) : "0.00";
                  const key = r.account_id ?? r.email ?? `row-${idx}`;
                  return (
                    <TableRow key={key}>
                      <TableCell>{r.email} · {r.provider}</TableCell>
                      <TableCell>{r.delivered}</TableCell>
                      <TableCell>{open}%</TableCell>
                      <TableCell>{click}%</TableCell>
                      <TableCell>{bounce}%</TableCell>
                      <TableCell>{r.complaints}</TableCell>
                      <TableCell>{r.unsubscribes}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold">Suppressed Domains</h3>
          <ul className="mt-3 space-y-2">
            {domains.map((d) => (
              <li key={d.domain} className="flex items-center justify-between border rounded-xl px-3 py-2 text-sm">
                <span>{d.domain}</span>
                <span className="opacity-70">
                  {d.reason}
                  {d.expires_at ? ` (until ${new Date(d.expires_at).toLocaleDateString()})` : ""}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}


