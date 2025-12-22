"use client";

import * as React from "react";
import useSWR from "swr";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";

const fetcher = (url: string) => fetch(url).then((res) => {
  if (!res.ok) throw new Error("Request failed");
  return res.json();
});

type ScenarioOption = { key: string; label: string };

type SparkPoint = { day: string; value: number };

type LeaderboardRow = {
  campaign_id: string;
  scenario: string;
  variant_id: string;
  name: string;
  is_active: boolean;
  samples: number;
  successes: number;
  avg_reward: number | null;
  posterior_mean: number | null;
  sparkline: SparkPoint[];
};

function Sparkline({ points }: { points: SparkPoint[] }) {
  const width = 96;
  const height = 32;
  const values = points.map((p) => Number.isFinite(p.value) ? p.value : 0);
  const minValue = Math.min(...values, 0);
  const maxValue = Math.max(...values, minValue + 1e-3);
  const range = maxValue - minValue || 1;

  const path = values
    .map((value, idx) => {
      const x = points.length === 1 ? width : (idx / (points.length - 1)) * width;
      const y = height - ((value - minValue) / range) * height;
      return `${idx === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-8 w-24 text-indigo-500">
      <path d={path} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}

function useScenarios(campaignId: string) {
  const [scenarios, setScenarios] = React.useState<ScenarioOption[]>([]);

  React.useEffect(() => {
    if (!campaignId) return;
    fetch(`/api/campaign/${campaignId}/nudges/presets`)
      .then((res) => res.json())
      .then((json) => {
        const opts: ScenarioOption[] = (json?.scenarios ?? []).map((s: any) => ({ key: s.key, label: s.label }));
        setScenarios(opts.length ? opts : [{ key: "no_reply", label: "No Reply" }]);
      })
      .catch(() => {
        setScenarios([{ key: "no_reply", label: "No Reply" }]);
      });
  }, [campaignId]);

  return scenarios;
}

function statusFor(row: LeaderboardRow): { label: string; icon: string } {
  if (!row.is_active) return { icon: "⏸️", label: "Paused" };
  if ((row.samples ?? 0) < 10) return { icon: "⚖️", label: "Exploring" };
  const posterior = row.posterior_mean ?? 0;
  if (posterior >= 0.35) return { icon: "🟢", label: "Favoring" };
  if (posterior >= 0.2) return { icon: "⚖️", label: "Exploring" };
  return { icon: "🟡", label: "De-prioritized" };
}

export default function VariantTeacher({ campaignId }: { campaignId: string }) {
  const scenarios = useScenarios(campaignId);
  const [selected, setSelected] = React.useState<string | null>(null);
  const scenarioValue = selected ?? scenarios[0]?.key ?? null;

  React.useEffect(() => {
    if (!selected && scenarios[0]) {
      setSelected(scenarios[0].key);
    }
  }, [scenarios, selected]);

  const { data, isLoading, mutate, error } = useSWR<LeaderboardRow[]>(
    scenarioValue ? `/api/nudge/leaderboard?campaignId=${campaignId}&scenario=${encodeURIComponent(scenarioValue)}` : null,
    fetcher,
  );

  const [pending, setPending] = React.useState<string | null>(null);

  const runAction = React.useCallback(
    async (variantId: string, action: "pause" | "resume" | "boost" | "reset") => {
      if (!scenarioValue) return;
      setPending(`${variantId}:${action}`);
      try {
        const res = await fetch(`/api/nudge/variant-action`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ variantId, campaignId, scenario: scenarioValue, action }),
        });
        const json = await res.json();
        if (!res.ok || json?.error) {
          throw new Error(json?.error || "Action failed");
        }
        toast.success(`${action.charAt(0).toUpperCase()}${action.slice(1)} applied`);
        mutate();
      } catch (err: any) {
        toast.error(err?.message ?? "Action failed");
      } finally {
        setPending(null);
      }
    },
    [campaignId, scenarioValue, mutate],
  );

  return (
    <Card className="space-y-4 p-4">
      <div>
        <div className="text-sm font-medium text-muted-foreground uppercase">Variant Teacher</div>
        <h2 className="text-xl font-semibold">Which follow-ups are winning?</h2>
      </div>

      <Tabs defaultValue={scenarioValue ?? "no_reply"} value={scenarioValue ?? undefined} onValueChange={setSelected}>
        <TabsList>
          {scenarios.map((s) => (
            <TabsTrigger key={s.key} value={s.key}>
              {s.label || s.key}
            </TabsTrigger>
          ))}
        </TabsList>
        {scenarios.map((s) => (
          <TabsContent key={s.key} value={s.key} className="mt-4">
            {isLoading && (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, idx) => (
                  <Skeleton key={idx} className="h-10 w-full" />
                ))}
              </div>
            )}
            {error && <div className="text-sm text-red-600">Failed to load leaderboard.</div>}
            {!isLoading && !error && (!data || data.length === 0) && (
              <div className="rounded border border-dashed p-6 text-center text-sm text-muted-foreground">
                No variants yet for this scenario.
              </div>
            )}
            {!isLoading && data && data.length > 0 && (
              <Table>
                <THead>
                  <TR>
                    <TH>Variant</TH>
                    <TH>Samples</TH>
                    <TH>Successes</TH>
                    <TH>Avg Reward</TH>
                    <TH>Posterior Mean</TH>
                    <TH>Status</TH>
                    <TH>7-day Reward</TH>
                    <TH className="text-right">Actions</TH>
                  </TR>
                </THead>
                <TBody>
                  {data.map((row) => {
                    const status = statusFor(row);
                    return (
                      <TR key={row.variant_id}>
                        <TD>{row.name}</TD>
                        <TD>{row.samples ?? 0}</TD>
                        <TD>{row.successes ?? 0}</TD>
                        <TD>{(row.avg_reward ?? 0).toFixed(2)}</TD>
                        <TD>{(row.posterior_mean ?? 0).toFixed(2)}</TD>
                        <TD>{`${status.icon} ${status.label}`}</TD>
                        <TD>
                          <Sparkline points={row.sparkline} />
                        </TD>
                        <TD className="text-right space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={pending !== null}
                            onClick={() => runAction(row.variant_id, row.is_active ? "pause" : "resume")}
                          >
                            {row.is_active ? "Pause" : "Resume"}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={pending !== null}
                            onClick={() => runAction(row.variant_id, "boost")}
                          >
                            Boost +0.5
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={pending !== null}
                            onClick={() => runAction(row.variant_id, "reset")}
                          >
                            Reset Priors
                          </Button>
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            )}
          </TabsContent>
        ))}
      </Tabs>
    </Card>
  );
}





