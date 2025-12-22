"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import NormalRangeCard from "./NormalRangeCard";
import { isCoachingUIEnabled } from "@/lib/feature-flags";

type DemandThrottle = "low" | "normal" | "high";

type OSLeversResponse = {
  ok: boolean;
  workspace_id: string;
  as_of: string;
  autopilot?: {
    enabled: boolean;
    enabled_at: string | null;
    locked: boolean;
    locked_at: string | null;
    lock_days: number;
  };
  authority?: {
    proven_path_locked: boolean;
    proven_path_locked_at: string | null;
  };
  levers: {
    volume: DemandThrottle;
    area_zip_enabled: boolean;
    capacity_crews_x: number | null;
  };
  immediate_effect: {
    volume_daily_cap: number;
    homeowners_contacted_today: number;
    homeowners_contacted_remaining_today: number;
    conversations_today: number;
    jobs_closed_today: number;
    area_pool_all: number;
    area_pool_in_service_area: number;
    area_pool_effective: number;
  };
  capacity_status: {
    jobs_booked_open: number;
    is_full: boolean;
    message: string | null;
  };
};

type OwnerControlResponse = {
  ok: boolean;
  as_of: string;
  metrics: {
    hot_homeowners_waiting: number;
    estimates_in_stage: number;
    value_in_play_today: number;
    value_in_play_week: number;
  };
};

type AuthorityLineResponse = {
  ok: boolean;
  line: null | {
    id: string;
    type: string;
    message: string;
    created_at: string;
  };
};

function money(v: unknown) {
  const n = typeof v === "number" ? v : Number(String(v ?? 0));
  const safe = Number.isFinite(n) ? n : 0;
  return safe.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export default function OSClient() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [levers, setLevers] = useState<OSLeversResponse | null>(null);
  const [owner, setOwner] = useState<OwnerControlResponse | null>(null);
  const [authorityLine, setAuthorityLine] = useState<AuthorityLineResponse["line"]>(null);

  const volume = levers?.levers.volume ?? "normal";
  const areaOn = levers?.levers.area_zip_enabled ?? false;
  const autopilotOn = Boolean(levers?.autopilot?.enabled);
  const provenLocked = Boolean(levers?.authority?.proven_path_locked);

  const [capacityInput, setCapacityInput] = useState<string>("");
  const [reason, setReason] = useState<string>("");

  const [decisionOpen, setDecisionOpen] = useState(false);
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [decisionErr, setDecisionErr] = useState<string | null>(null);
  const [pendingDecision, setPendingDecision] = useState<null | {
    decision_type: "os_levers" | "autopilot_toggle" | "other";
    action_label: string;
    proposed_changes: any;
    context: any;
    onAct: (decisionId: string) => Promise<void>;
  }>(null);

  async function createDecision(input: {
    decision_type: string;
    choice: "act" | "accept";
    action_label: string;
    proposed_changes: any;
    context: any;
  }) {
    const res = await fetch("/api/decisions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decision_type: input.decision_type,
        choice: input.choice,
        action_label: input.action_label,
        proposed_changes: input.proposed_changes ?? {},
        context: input.context ?? {},
        valid_for_seconds: 15 * 60,
      }),
    });
    const json = (await res.json().catch(() => null)) as any;
    if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to create decision");
    const id = String(json?.decision?.id || "");
    if (!id) throw new Error("Decision id missing");
    return id;
  }

  function openDecision(next: NonNullable<typeof pendingDecision>) {
    setPendingDecision(next);
    setDecisionErr(null);
    setDecisionOpen(true);
  }

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [r1, r2, r3] = await Promise.all([
        fetch("/api/os/levers", { cache: "no-store" }),
        fetch("/api/owner/control", { cache: "no-store" }),
        fetch("/api/authority/lines", { cache: "no-store" }),
      ]);
      const j1 = (await r1.json().catch(() => null)) as OSLeversResponse | null;
      const j2 = (await r2.json().catch(() => null)) as any;
      const j3 = (await r3.json().catch(() => null)) as AuthorityLineResponse | null;
      if (!r1.ok || !j1?.ok) throw new Error((j1 as any)?.error || "Failed to load levers");

      setLevers(j1);
      setCapacityInput(j1.levers.capacity_crews_x === null ? "" : String(j1.levers.capacity_crews_x));

      if (r2.ok && j2?.ok) {
        setOwner({
          ok: true,
          as_of: j2.as_of,
          metrics: {
            hot_homeowners_waiting: Number(j2.metrics?.hot_homeowners_waiting ?? 0),
            estimates_in_stage: Number(j2.metrics?.estimates_in_stage ?? 0),
            value_in_play_today: Number(j2.metrics?.value_in_play_today ?? 0),
            value_in_play_week: Number(j2.metrics?.value_in_play_week ?? 0),
          },
        });
      } else {
        setOwner(null);
      }

      if (r3.ok && j3?.ok) {
        setAuthorityLine(j3.line ?? null);
      } else {
        setAuthorityLine(null);
      }

      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load OS");
      setLevers(null);
      setOwner(null);
      setAuthorityLine(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const save = useCallback(
    async (next: { volume?: DemandThrottle; area_zip_enabled?: boolean; capacity_crews_x?: number | null }) => {
      if (!levers) return;
      if (!reason) {
        setError("Select a reason to change the system.");
        return;
      }
      openDecision({
        decision_type: "os_levers",
        action_label: "Change OS levers (volume/area/capacity)",
        proposed_changes: {
          volume: next.volume ?? levers.levers.volume,
          area_zip_enabled: next.area_zip_enabled ?? levers.levers.area_zip_enabled,
          capacity_crews_x: next.capacity_crews_x === undefined ? levers.levers.capacity_crews_x : next.capacity_crews_x,
          reason,
        },
        context: {
          as_of: levers.as_of,
          immediate_effect: levers.immediate_effect,
          capacity_status: levers.capacity_status,
          authority: levers.authority,
          autopilot: levers.autopilot,
        },
        onAct: async (decisionId) => {
          setSaving(true);
          setError(null);

          // Optimistic UI: apply immediately so cause→effect is instant.
          const optimistic: OSLeversResponse = {
            ...levers,
            levers: {
              volume: next.volume ?? levers.levers.volume,
              area_zip_enabled: next.area_zip_enabled ?? levers.levers.area_zip_enabled,
              capacity_crews_x:
                next.capacity_crews_x === undefined ? levers.levers.capacity_crews_x : next.capacity_crews_x,
            },
          };
          setLevers(optimistic);

          try {
            const res = await fetch("/api/os/levers", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                decision_id: decisionId,
                volume: next.volume ?? levers.levers.volume,
                area_zip_enabled: next.area_zip_enabled ?? levers.levers.area_zip_enabled,
                capacity_crews_x:
                  next.capacity_crews_x === undefined ? levers.levers.capacity_crews_x : next.capacity_crews_x,
                reason,
              }),
            });
            const json = (await res.json().catch(() => null)) as OSLeversResponse | null;
            if (!res.ok || !json?.ok) throw new Error((json as any)?.error || "Failed to save");
            setLevers(json);
            setCapacityInput(json.levers.capacity_crews_x === null ? "" : String(json.levers.capacity_crews_x));
          } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to save");
            await refresh();
            throw e;
          } finally {
            setSaving(false);
          }
        },
      });
    },
    [levers, refresh, reason]
  );

  const effect = levers?.immediate_effect;
  const cap = levers?.capacity_status;
  const ownerMetrics = owner?.metrics;

  const capacityStatusLine = useMemo(() => {
    if (!cap) return "—";
    if (cap.is_full) return cap.message || "Demand exceeds availability.";
    return "Capacity available.";
  }, [cap]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">SmartSend OS</h1>
          <div className="mt-1 text-sm text-muted-foreground">
            Three levers. Immediate cause → effect. Nothing else matters.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard/control-tower">
            <Button variant="outline">Control Tower</Button>
          </Link>
          <Button variant="outline" onClick={refresh} disabled={loading || saving}>
            Refresh
          </Button>
          {isCoachingUIEnabled() && (
            <Link href="/dashboard/onboarding">
              <Button variant="outline">Onboarding</Button>
            </Link>
          )}
        </div>
      </header>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">{error}</div>
      ) : null}

      {authorityLine?.message ? (
        <div className="text-sm text-muted-foreground">{authorityLine.message}</div>
      ) : null}

      {provenLocked ? (
        <div className="rounded-lg border bg-white p-4 text-sm">
          <div className="font-semibold">Proven path locked.</div>
          <div className="mt-1 text-muted-foreground">You can view levers, but you can’t change them.</div>
        </div>
      ) : (
        <div className="rounded-lg border bg-white p-4">
          <div className="text-xs font-semibold text-gray-900">Reason (required)</div>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={loading || saving}
            >
              <option value="">Select…</option>
              <option value="capacity_change">Capacity change</option>
              <option value="crew_change">Crew change</option>
              <option value="geographic_expansion">Geographic expansion</option>
            </select>
            <div className="text-sm text-muted-foreground flex items-center">
              No “I feel like it” option.
            </div>
          </div>
        </div>
      )}

      {/* Three levers only */}
      <section className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-3">
          <CardHeader>
            <CardTitle>AUTOPILOT</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="text-sm text-muted-foreground">
              When ON: volume/area/capacity controls are locked. Your only job is reply → book → close.
            </div>
            <Button
              variant={autopilotOn ? "default" : "outline"}
              disabled={loading || saving}
              onClick={async () => {
                openDecision({
                  decision_type: "autopilot_toggle",
                  action_label: autopilotOn ? "Disable AUTOPILOT" : "Enable AUTOPILOT",
                  proposed_changes: { enabled: !autopilotOn },
                  context: { autopilot: levers?.autopilot ?? null, authority: levers?.authority ?? null },
                  onAct: async (decisionId) => {
                    setSaving(true);
                    setError(null);
                    try {
                      const res = await fetch("/api/autopilot", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ enabled: !autopilotOn, decision_id: decisionId }),
                      });
                      const j = await res.json().catch(() => null);
                      if (!res.ok) throw new Error(j?.error || "Failed to toggle AUTOPILOT");
                      await refresh();
                    } finally {
                      setSaving(false);
                    }
                  },
                });
              }}
            >
              {autopilotOn ? "AUTOPILOT: ON" : "AUTOPILOT: OFF"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Volume</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-xs text-muted-foreground">LOW / NORMAL / HIGH</div>
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={volume}
              onChange={(e) => save({ volume: e.target.value as DemandThrottle })}
              disabled={loading || saving || autopilotOn || provenLocked}
            >
              <option value="low">LOW</option>
              <option value="normal">NORMAL</option>
              <option value="high">HIGH</option>
            </select>
            <div className="text-sm text-muted-foreground">
              Daily cap: <span className="font-semibold text-foreground">{effect ? effect.volume_daily_cap : "—"}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Area</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-xs text-muted-foreground">Zip ON / OFF</div>
            <div className="flex items-center gap-2">
              <Button
                onClick={() => save({ area_zip_enabled: !areaOn })}
                disabled={loading || saving || autopilotOn || provenLocked}
                variant={areaOn ? "default" : "outline"}
              >
                {areaOn ? "ON" : "OFF"}
              </Button>
              <div className="text-sm text-muted-foreground">
                Reachable pool:{" "}
                <span className="font-semibold text-foreground">
                  {effect ? effect.area_pool_effective.toLocaleString() : "—"}
                </span>
              </div>
            </div>
            {effect ? (
              <div className="text-xs text-muted-foreground">
                In service area: {effect.area_pool_in_service_area.toLocaleString()} • All:{" "}
                {effect.area_pool_all.toLocaleString()}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Capacity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-xs text-muted-foreground">Crews X (jobs)</div>
            <div className="flex items-center gap-2">
              <input
                className="w-28 rounded-md border border-input bg-background px-3 py-2 text-sm"
                inputMode="numeric"
                value={capacityInput}
                onChange={(e) => setCapacityInput(e.target.value.replace(/[^\d]/g, ""))}
                placeholder="e.g. 12"
                disabled={loading || saving || autopilotOn || provenLocked}
              />
              <Button
                onClick={() => save({ capacity_crews_x: capacityInput === "" ? null : Number(capacityInput) })}
                disabled={loading || saving || autopilotOn || provenLocked}
              >
                Apply
              </Button>
            </div>
            <div className="text-xs text-muted-foreground">
              Open jobs: {cap ? cap.jobs_booked_open : "—"} • Status:{" "}
              <span className={cap?.is_full ? "font-semibold text-red-700" : "font-semibold text-emerald-700"}>
                {capacityStatusLine}
              </span>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Immediate cause → effect */}
      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Cause → Effect</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Homeowners contacted</span>
              <span className="font-semibold tabular-nums">
                {effect ? `${effect.homeowners_contacted_today}/${effect.volume_daily_cap}` : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Conversations today</span>
              <span className="font-semibold tabular-nums">{effect ? effect.conversations_today : "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Jobs closed today</span>
              <span className="font-semibold tabular-nums">{effect ? effect.jobs_closed_today : "—"}</span>
            </div>
            <div className="pt-2 text-xs text-muted-foreground">
              You don’t “try things.” You pull levers.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Today’s activity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Hot homeowners waiting</span>
              <span className="font-semibold tabular-nums">{ownerMetrics ? ownerMetrics.hot_homeowners_waiting : "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Estimates in stage</span>
              <span className="font-semibold tabular-nums">{ownerMetrics ? ownerMetrics.estimates_in_stage : "—"}</span>
            </div>
            <div className="pt-2 flex gap-2">
              <Link href="/dashboard/inbox-unified?filter=hot_lead">
                <Button size="sm">Reply</Button>
              </Link>
              <Link href="/dashboard/estimates">
                <Button size="sm" variant="outline">
                  Estimates
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Money in play</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Today</span>
              <span className="font-semibold tabular-nums">{ownerMetrics ? money(ownerMetrics.value_in_play_today) : "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Week</span>
              <span className="font-semibold tabular-nums">{ownerMetrics ? money(ownerMetrics.value_in_play_week) : "—"}</span>
            </div>
            <div className="pt-2 text-xs text-muted-foreground">No deep dives. Only revenue motion.</div>
          </CardContent>
        </Card>
      </section>

      {/* Reliability (quiet) */}
      <section className="grid gap-4 md:grid-cols-1">
        <NormalRangeCard />
      </section>

      {/* Act or Accept modal (Block 274100) */}
      {decisionOpen && pendingDecision ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-xl rounded-xl border bg-white shadow-xl">
            <div className="border-b px-5 py-4">
              <div className="text-xs font-semibold text-gray-600">CONTROL TOWER</div>
              <div className="mt-1 text-lg font-bold text-gray-900">Act or Accept</div>
              <div className="mt-1 text-sm text-gray-600">{pendingDecision.action_label}</div>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="text-xs font-semibold text-gray-700">Proposed change</div>
              <pre className="max-h-56 overflow-auto rounded-md border bg-gray-50 p-3 text-xs text-gray-800">
{JSON.stringify(pendingDecision.proposed_changes ?? {}, null, 2)}
              </pre>
              {decisionErr ? (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
                  {decisionErr}
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <Button
                  variant="outline"
                  disabled={decisionBusy}
                  onClick={async () => {
                    setDecisionBusy(true);
                    setDecisionErr(null);
                    try {
                      await createDecision({
                        decision_type: pendingDecision.decision_type,
                        choice: "accept",
                        action_label: pendingDecision.action_label,
                        proposed_changes: pendingDecision.proposed_changes,
                        context: pendingDecision.context,
                      });
                      setDecisionOpen(false);
                      setPendingDecision(null);
                    } catch (e) {
                      setDecisionErr(e instanceof Error ? e.message : "Failed to record decision");
                    } finally {
                      setDecisionBusy(false);
                    }
                  }}
                >
                  Accept (hold steady)
                </Button>
                <Button
                  disabled={decisionBusy}
                  onClick={async () => {
                    setDecisionBusy(true);
                    setDecisionErr(null);
                    try {
                      const decisionId = await createDecision({
                        decision_type: pendingDecision.decision_type,
                        choice: "act",
                        action_label: pendingDecision.action_label,
                        proposed_changes: pendingDecision.proposed_changes,
                        context: pendingDecision.context,
                      });
                      await pendingDecision.onAct(decisionId);
                      setDecisionOpen(false);
                      setPendingDecision(null);
                    } catch (e) {
                      setDecisionErr(e instanceof Error ? e.message : "Failed to act");
                    } finally {
                      setDecisionBusy(false);
                    }
                  }}
                >
                  Act
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {loading ? <div className="text-sm text-muted-foreground">Loading…</div> : null}
    </div>
  );
}



