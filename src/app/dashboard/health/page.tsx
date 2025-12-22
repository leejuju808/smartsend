"use client";
import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import {
  Table,
  THead,
  TR,
  TH,
  TBody,
  TD,
} from "@/components/ui/table";

type Row = {
  domain: string;
  sent_30d: number;
  bounces_30d: number;
  hard_bounces_30d: number;
  unsubs_30d: number;
  bounce_rate_30d: number;
  unsub_rate_30d: number;
};

export default function DomainHealth() {
  const supabase = createClientComponentClient();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("domain_health_30d")
        .select("*");
      if (!error && data) setRows(data as unknown as Row[]);
      setLoading(false);
    })();
  }, [supabase]);

  const totals = rows.reduce(
    (a, r) => {
      a.sent += r.sent_30d;
      a.b += r.bounces_30d;
      a.hb += r.hard_bounces_30d;
      a.u += r.unsubs_30d;
      return a;
    },
    { sent: 0, b: 0, hb: 0, u: 0 }
  );

  const br = totals.sent
    ? ((100 * totals.b) / totals.sent).toFixed(2)
    : "0.00";
  const ubr = totals.sent
    ? ((100 * totals.u) / totals.sent).toFixed(2)
    : "0.00";

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Domain Health</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Sent (30d)</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold">{totals.sent}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Bounce Rate (30d)</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold">{br}%</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Unsubscribe Rate (30d)</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-bold">{ubr}%</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>By Recipient Domain</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-4">Loading...</div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Domain</TH>
                  <TH><div className="text-right">Sent</div></TH>
                  <TH><div className="text-right">Bounces</div></TH>
                  <TH><div className="text-right">Hard</div></TH>
                  <TH><div className="text-right">Unsubs</div></TH>
                  <TH><div className="text-right">Bounce %</div></TH>
                  <TH><div className="text-right">Unsub %</div></TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((r) => (
                  <TR key={r.domain}>
                    <TD className="font-medium">{r.domain}</TD>
                    <TD className="text-right">{r.sent_30d}</TD>
                    <TD className="text-right">
                      {r.bounces_30d}
                    </TD>
                    <TD className="text-right">
                      {r.hard_bounces_30d}
                    </TD>
                    <TD className="text-right">{r.unsubs_30d}</TD>
                    <TD className="text-right">
                      {r.bounce_rate_30d}%
                    </TD>
                    <TD className="text-right">
                      {r.unsub_rate_30d}%
                    </TD>
                  </TR>
                ))}
                {rows.length === 0 && (
                  <TR>
                    <TD>
                      <div className="text-center text-sm text-muted-foreground">
                        No data yet.
                      </div>
                    </TD>
                  </TR>
                )}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
} 