"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type VariantMetric = {
  variant_id: string;
  scenario: string;
  tone: string;
  name?: string | null;
  subject?: string | null;
  weight: number | null;
  is_active?: boolean | null;
  pinned?: boolean | null;
  pinned_weight?: number | null;
  total_sent?: number | null;
  reply_rate?: number | null;
  positive_rate?: number | null;
  delivery_rate?: number | null;
};

type FollowupRules = {
  auto_reweight_enabled: boolean;
  reweight_min_sends: number;
  reweight_metric: "reply" | "positive";
  reweight_floor: number;
  reweight_ceiling: number;
  reweight_smoothing: number;
  picker_mode: "explore" | "exploit";
  picker_epsilon: number;
};

type VariantAudit = {
  created_at: string;
  scenario: string;
  tone: string;
  variant_id: string;
  old_weight: number;
  new_weight: number;
  basis: string;
  window_start: string;
  window_end: string;
  stats: Record<string, unknown>;
};

export default function NudgeVariantAnalytics({ campaignId }: { campaignId: string }) {
  const [variants, setVariants] = React.useState<VariantMetric[]>([]);
  const [rules, setRules] = React.useState<FollowupRules | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [autoOn, setAutoOn] = React.useState<boolean | null>(null);
  const [audits, setAudits] = React.useState<VariantAudit[]>([]);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/campaign/${campaignId}/nudge/metrics`).then((r) => r.json());
      if (res.ok) {
        setVariants(res.variants ?? []);
      } else {
        toast.error("Failed to load variant metrics");
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to load variant metrics");
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  const loadRules = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/campaign/${campaignId}/followup/rules`).then((r) => r.json());
      if (res.ok && res.rules) {
        const epsRaw = Number(res.rules.picker_epsilon);
        const eps = Number.isFinite(epsRaw) ? Math.min(1, Math.max(0, epsRaw)) : 0.1;
        const next: FollowupRules = {
          ...res.rules,
          picker_mode: (res.rules.picker_mode ?? "explore") as FollowupRules["picker_mode"],
          picker_epsilon: eps,
        };
        setRules(next);
        setAutoOn(!!next.auto_reweight_enabled);
      } else {
        setRules(null);
        setAutoOn(null);
      }
    } catch (err) {
      console.error(err);
      setRules(null);
      setAutoOn(null);
    }
  }, [campaignId]);

  const loadAudits = React.useCallback(async () => {
    try {
      const resp = await fetch(`/api/campaign/${campaignId}/nudge/audit?limit=20`).catch(() => null);
      if (!resp) return;
      if (resp.ok) {
        const data = await resp.json();
        if (data.ok) {
          setAudits(data.items ?? []);
        }
      }
    } catch (err) {
      console.error(err);
    }
  }, [campaignId]);

  React.useEffect(() => {
    load();
    loadRules();
    loadAudits();
  }, [load, loadRules, loadAudits]);

  async function saveRules(patch: Partial<FollowupRules>) {
    if (!Object.keys(patch).length) return;
    setRules((prev) => (prev ? { ...prev, ...patch } : prev));
    setBusy(true);
    try {
      const res = await fetch(`/api/campaign/${campaignId}/followup/rules`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      }).then((r) => r.json());
      if (res.ok) {
        await loadRules();
        toast.success("Rules updated");
      } else {
        toast.error("Failed to update rules");
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to update rules");
    } finally {
      setBusy(false);
    }
  }

  async function toggleAuto(v: boolean) {
    setBusy(true);
    try {
      const res = await fetch(`/api/campaign/${campaignId}/nudge/reweight/toggle`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: v }),
      }).then((r) => r.json());
      if (res.ok) {
        setAutoOn(v);
        setRules((prev) => (prev ? { ...prev, auto_reweight_enabled: v } : prev));
        toast.success(v ? "Auto reweight enabled" : "Auto reweight disabled");
      } else {
        toast.error("Failed to update auto reweight toggle");
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to update auto reweight toggle");
    } finally {
      setBusy(false);
    }
  }

  async function runAutoReweight() {
    setBusy(true);
    try {
      const res = await fetch(`/api/campaign/${campaignId}/nudge/reweight`, {
        method: "POST",
      }).then((r) => r.json());
      if (res.ok) {
        toast.success(`Reweighted ${res.changed ?? 0} variant(s)`);
        await Promise.all([load(), loadAudits()]);
      } else {
        toast.error("Auto reweight failed");
      }
    } catch (err) {
      console.error(err);
      toast.error("Auto reweight failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">Variant Analytics</div>
          <div className="text-xs text-muted-foreground">
            Review performance, adjust guardrails, and pin weights as needed.
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between rounded-md border p-3">
        <div className="flex items-center gap-3">
          <label className="text-sm">
            <input
              type="checkbox"
              className="mr-2"
              checked={!!autoOn}
              onChange={(e) => toggleAuto(e.target.checked)}
              disabled={busy || autoOn === null}
            />
            Auto reweight weekly
          </label>
          <Button size="sm" variant="outline" onClick={runAutoReweight} disabled={busy}>
            Run now
          </Button>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            load();
            loadAudits();
            loadRules();
          }}
          disabled={busy}
        >
          Refresh
        </Button>
      </div>

      {rules && (
        <>
          <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-6">
            <label className="text-sm col-span-2">
              <div className="text-xs text-muted-foreground">Picker strategy</div>
              <select
                className="w-full border rounded px-2 py-1"
                defaultValue={rules.picker_mode}
                onChange={(e) => saveRules({ picker_mode: e.target.value as FollowupRules["picker_mode"] })}
              >
                <option value="explore">Explore (favor underused)</option>
                <option value="exploit">Exploit (favor winners)</option>
              </select>
            </label>
            <label className="text-sm col-span-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Explore % (ε)</span>
                <span className="text-xs">{Math.round((rules.picker_epsilon ?? 0) * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                defaultValue={rules.picker_epsilon ?? 0.1}
                onChange={(e) => {
                  const parsed = Number.parseFloat(e.target.value);
                  const next = Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : rules.picker_epsilon;
                  saveRules({ picker_epsilon: next });
                }}
                className="w-full"
              />
            </label>
          <label className="col-span-1 text-sm">
            <div className="text-xs text-muted-foreground">Min sends</div>
            <input
              className="w-full rounded border px-2 py-1"
              type="number"
              min={1}
              defaultValue={rules.reweight_min_sends}
              onBlur={(e) => {
                const parsed = Number.parseInt(e.target.value, 10);
                const next =
                  Number.isFinite(parsed) && parsed > 0 ? parsed : rules.reweight_min_sends;
                saveRules({ reweight_min_sends: next });
              }}
            />
          </label>
          <label className="col-span-1 text-sm">
            <div className="text-xs text-muted-foreground">Metric</div>
            <select
              className="w-full rounded border px-2 py-1"
              defaultValue={rules.reweight_metric}
              onChange={(e) => saveRules({ reweight_metric: e.target.value as FollowupRules["reweight_metric"] })}
            >
              <option value="reply">Reply rate</option>
              <option value="positive">Positive rate</option>
            </select>
          </label>
          <label className="col-span-1 text-sm">
            <div className="text-xs text-muted-foreground">Floor</div>
            <input
              className="w-full rounded border px-2 py-1"
              type="number"
              step="0.1"
              defaultValue={rules.reweight_floor}
              onBlur={(e) => {
                const parsed = Number.parseFloat(e.target.value);
                const next = Number.isFinite(parsed) ? parsed : rules.reweight_floor;
                saveRules({ reweight_floor: next });
              }}
            />
          </label>
          <label className="col-span-1 text-sm">
            <div className="text-xs text-muted-foreground">Ceiling</div>
            <input
              className="w-full rounded border px-2 py-1"
              type="number"
              step="0.1"
              defaultValue={rules.reweight_ceiling}
              onBlur={(e) => {
                const parsed = Number.parseFloat(e.target.value);
                const next = Number.isFinite(parsed) ? parsed : rules.reweight_ceiling;
                saveRules({ reweight_ceiling: next });
              }}
            />
          </label>
          <label className="col-span-1 text-sm">
            <div className="text-xs text-muted-foreground">Smoothing</div>
            <input
              className="w-full rounded border px-2 py-1"
              type="number"
              step="0.5"
              defaultValue={rules.reweight_smoothing}
              onBlur={(e) => {
                const parsed = Number.parseFloat(e.target.value);
                const next = Number.isFinite(parsed) ? parsed : rules.reweight_smoothing;
                saveRules({ reweight_smoothing: next });
              }}
            />
          </label>
        </div>
          <div className="px-1 text-xs text-muted-foreground space-y-1">
            <div>Explore: tries less-used variants more often to learn faster.</div>
            <div>Exploit: leans into variants with higher reply-rate.</div>
            <div>ε (Explore %): probability to ignore scores and pick purely at random.</div>
          </div>
        </>
      )}

      {loading ? (
        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          Loading variant metrics…
        </div>
      ) : variants.length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
          No variants yet. Create at least one follow-up variant to view analytics.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Scenario</th>
                <th className="px-3 py-2">Tone</th>
                <th className="px-3 py-2">Weight</th>
                <th className="px-3 py-2">Sent</th>
                <th className="px-3 py-2">Reply %</th>
                <th className="px-3 py-2">Positive %</th>
                <th className="px-3 py-2">Delivery %</th>
                <th className="px-3 py-2">Pinned</th>
                <th className="px-3 py-2">Pinned weight</th>
              </tr>
            </thead>
            <tbody>
              {variants.map((v) => (
                <tr key={v.variant_id} className="border-b">
                  <td className="px-3 py-2 font-medium">
                    <div>{v.scenario}</div>
                    <div className="text-xs text-muted-foreground">{v.name ?? "—"}</div>
                  </td>
                  <td className="px-3 py-2">{v.tone}</td>
                  <td className="px-3 py-2">{v.weight ?? "—"}</td>
                  <td className="px-3 py-2">{v.total_sent ?? 0}</td>
                  <td className="px-3 py-2">{v.reply_rate ?? 0}%</td>
                  <td className="px-3 py-2">{v.positive_rate ?? 0}%</td>
                  <td className="px-3 py-2">{v.delivery_rate ?? 0}%</td>
                  <td className="px-3 py-2">
                    <input
                      key={`pin-${v.variant_id}-${v.pinned ? "1" : "0"}`}
                      type="checkbox"
                      defaultChecked={!!v.pinned}
                      onChange={async (e) => {
                        try {
                          await fetch(`/api/nudge-variant/${v.variant_id}/pin`, {
                            method: "PATCH",
                            headers: { "content-type": "application/json" },
                            body: JSON.stringify({ pinned: e.target.checked }),
                          });
                        } catch (err) {
                          console.error(err);
                          toast.error("Failed to update pin");
                        } finally {
                          await load();
                        }
                      }}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Input
                        key={`pin-weight-${v.variant_id}-${v.pinned_weight ?? "auto"}`}
                        type="number"
                        step="0.1"
                        className="w-20"
                        placeholder="auto"
                        defaultValue={v.pinned_weight ?? ""}
                        onBlur={async (e) => {
                          const val = e.target.value.trim();
                          try {
                            await fetch(`/api/nudge-variant/${v.variant_id}/pin`, {
                              method: "PATCH",
                              headers: { "content-type": "application/json" },
                              body: JSON.stringify({
                                pinned: v.pinned || !!val,
                                pinned_weight: val === "" ? null : Number.parseFloat(val),
                              }),
                            });
                          } catch (err) {
                            console.error(err);
                            toast.error("Failed to update pinned weight");
                          } finally {
                            await load();
                          }
                        }}
                      />
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={async () => {
                          try {
                            await fetch(`/api/nudge-variant/${v.variant_id}/pin`, {
                              method: "PATCH",
                              headers: { "content-type": "application/json" },
                              body: JSON.stringify({ pinned: true, pinned_weight: v.weight }),
                            });
                          } catch (err) {
                            console.error(err);
                            toast.error("Failed to lock weight");
                          } finally {
                            await load();
                          }
                        }}
                      >
                        Lock current
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-md border p-3">
        <div className="mb-2 text-sm font-medium">Recent reweights</div>
        {audits.length === 0 ? (
          <div className="text-sm text-muted-foreground">No changes yet.</div>
        ) : (
          <ul className="space-y-1 text-xs">
            {audits.map((a, i) => (
              <li key={`${a.variant_id}-${a.created_at}-${i}`} className="flex items-center justify-between">
                <span>
                  {a.scenario} · {a.tone}
                </span>
                <span>
                  {a.old_weight} → <b>{a.new_weight}</b>
                </span>
                <span className="text-muted-foreground">
                  {new Date(a.created_at).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}


