"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type VariantStat = {
  variant_id: string;
  name: string;
  scenario: string;
  tone: string;
  weight: number | null;
  nudges_sent: number | null;
  good_outcomes: number | null;
  bad_outcomes: number | null;
  good_rate_pct: number | null;
  p50_minutes_to_outcome: number | null;
};

export default function NudgeABCard({ campaignId }: { campaignId: string }) {
  const [items, setItems] = React.useState<VariantStat[]>([]);

  React.useEffect(() => {
    let mounted = true;
    (async () => {
      const res = await fetch(`/api/campaign/${campaignId}/nudges/stats`).then((r) => r.json());
      if (!mounted) return;
      setItems(res.items ?? []);
    })();
    return () => {
      mounted = false;
    };
  }, [campaignId]);

  if (!items.length) {
    return (
      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="font-semibold">Nudge A/B Performance</div>
          <a href={`/campaign/${campaignId}/nudges`}>
            <Button variant="outline" size="sm">
              Manage variants
            </Button>
          </a>
        </div>
        <div className="text-sm text-muted-foreground">
          No A/B variants yet. Add variants to start tracking follow-up performance.
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div className="font-semibold">Nudge A/B Performance</div>
        <a href={`/campaign/${campaignId}/nudges`}>
          <Button variant="outline" size="sm">
            Manage variants
          </Button>
        </a>
      </div>
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {items.map((variant) => (
          <div key={variant.variant_id} className="rounded-md border p-3 text-sm">
            <div className="font-medium">{variant.name}</div>
            <div className="text-xs text-muted-foreground">
              {variant.scenario} · {variant.tone}
            </div>
            <div className="mt-2">
              Good rate: <b>{variant.good_rate_pct ?? "—"}%</b> · Sent: {variant.nudges_sent ?? 0}
            </div>
            <div className="text-xs text-muted-foreground">
              Median to outcome: {variant.p50_minutes_to_outcome ?? "—"} min
            </div>
            <div className="text-xs">Weight: {variant.weight ?? "—"}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

