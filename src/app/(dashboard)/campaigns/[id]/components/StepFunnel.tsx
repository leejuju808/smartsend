"use client";

import { Card, CardContent } from "@/components/ui/card";

export type StepFunnelRow = {
  step_no: number | null;
  variant_id: string | null;
  sent: number;
  opened: number;
  clicked: number;
  replied: number;
  bounced: number;
  open_rate_pct: number;
  click_rate_pct: number;
  reply_rate_pct: number;
  bounce_rate_pct: number;
};

export default function StepFunnel({ rows }: { rows: StepFunnelRow[] }) {
  const byStep = rows.reduce((acc: Record<string, any>, r) => {
    const key = r.step_no ?? 0;
    if (!acc[key]) {
      acc[key] = {
        step: key,
        sent: 0,
        opened: 0,
        clicked: 0,
        replied: 0,
        bounced: 0,
        variants: [] as StepFunnelRow[],
      };
    }
    acc[key].sent += r.sent;
    acc[key].opened += r.opened;
    acc[key].clicked += r.clicked;
    acc[key].replied += r.replied;
    acc[key].bounced += r.bounced;
    acc[key].variants.push(r);
    return acc;
  }, {} as Record<string, any>);

  const steps = Object.values(byStep).sort((a: any, b: any) => a.step - b.step) as any[];

  if (steps.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      {steps.map((s: any) => (
        <Card key={s.step} className="rounded-2xl">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-lg font-semibold">Step {s.step}</div>
              <div className="text-sm text-muted-foreground">
                Sent {s.sent} · Open {((s.opened / s.sent) * 100 || 0).toFixed(1)}% · Click {((s.clicked / s.sent) * 100 || 0).toFixed(1)}% · Reply {((s.replied / s.sent) * 100 || 0).toFixed(1)}% · Bounce {((s.bounced / s.sent) * 100 || 0).toFixed(1)}%
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {s.variants.map((v: StepFunnelRow, idx: number) => (
                <div key={v.variant_id ?? `variant-${s.step}-${idx}`} className="rounded-xl border p-3">
                  <div className="text-sm text-muted-foreground">
                    Variant {v.variant_id ? v.variant_id.slice(0, 6) : "—"}
                  </div>
                  <div className="text-xs">Sent {v.sent}</div>
                  <div className="text-xs">Open {v.open_rate_pct}%</div>
                  <div className="text-xs">Click {v.click_rate_pct}%</div>
                  <div className="text-xs">Reply {v.reply_rate_pct}%</div>
                  <div className="text-xs">Bounce {v.bounce_rate_pct}%</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

