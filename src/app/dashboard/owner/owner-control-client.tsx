"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ControlData = {
  ok: boolean;
  as_of: string;
  metrics: {
    hot_homeowners_waiting: number;
    estimates_in_stage: number;
    value_in_play_today: number;
    value_in_play_week: number;
    avg_homeowners_per_week: number;
    avg_booked_jobs_per_week: number;
  };
  hot_homeowners: Array<{
    id: string;
    created_at: string;
    read_at: string | null;
    subject: string;
    snippet: string;
    homeowner_name: string;
    homeowner_email: string | null;
    lead_id: string | null;
  }>;
  estimates: Array<{
    id: string;
    status: string | null;
    total: number;
    created_at: string;
    sent_at: string | null;
    homeowner_name: string | null;
    homeowner_email: string | null;
  }>;
};

type CapacitySettingsResponse = {
  ok: boolean;
  workspace_id: string;
  settings: {
    demand_throttle: "low" | "normal" | "high";
    crew_capacity_jobs: number | null;
  };
  status: {
    jobs_booked_open: number;
    is_full: boolean;
    message: string | null;
  };
};

type AutopilotStatusResponse = {
  ok: boolean;
  workspace_id: string;
  as_of: string;
  autopilot: {
    enabled: boolean;
    enabled_at: string | null;
    locked: boolean;
    locked_at: string | null;
    lock_days: number;
    days_in_autopilot: number;
    days_until_lock: number | null;
  };
};

type SpilloverZipsResponse = {
  ok: boolean;
  workspace_id: string;
  rows: Array<{ zip: string; is_active: boolean; updated_at: string }>;
};

type ResilienceMode = "normal" | "storm" | "surge";

type ResilienceModeResponse = {
  ok: boolean;
  workspace_id: string;
  resilience: {
    mode: ResilienceMode;
    mode_set_at: string | null;
    demand_throttle_effective: "low" | "normal" | "high";
    demand_throttle_current: string;
  };
};

function money(v: unknown) {
  const n = typeof v === "number" ? v : Number(String(v ?? 0));
  const safe = Number.isFinite(n) ? n : 0;
  return safe.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function timeAgo(iso: string) {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export default function OwnerControlClient() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ControlData | null>(null);

  const [awayLoading, setAwayLoading] = useState(false);
  const [awaySaving, setAwaySaving] = useState(false);
  const [awayError, setAwayError] = useState<string | null>(null);
  const [away, setAway] = useState<{
    enabled: boolean;
    session_id: string | null;
    started_at: string | null;
    ended_at: string | null;
  } | null>(null);
  const [awayLastSession, setAwayLastSession] = useState<{ id: string; started_at: string; ended_at: string | null } | null>(null);

  const [capLoading, setCapLoading] = useState(false);
  const [capSaving, setCapSaving] = useState(false);
  const [capError, setCapError] = useState<string | null>(null);
  const [capData, setCapData] = useState<CapacitySettingsResponse | null>(null);
  const [demandThrottle, setDemandThrottle] = useState<"low" | "normal" | "high">("normal");
  const [crewCapacityJobs, setCrewCapacityJobs] = useState<string>("");
  const [capReason, setCapReason] = useState<string>("");

  const [apLoading, setApLoading] = useState(false);
  const [apSaving, setApSaving] = useState(false);
  const [apError, setApError] = useState<string | null>(null);
  const [apData, setApData] = useState<AutopilotStatusResponse | null>(null);

  const [spillLoading, setSpillLoading] = useState(false);
  const [spillError, setSpillError] = useState<string | null>(null);
  const [spillData, setSpillData] = useState<SpilloverZipsResponse | null>(null);
  const [spillZip, setSpillZip] = useState("");

  const [resLoading, setResLoading] = useState(false);
  const [resSaving, setResSaving] = useState(false);
  const [resError, setResError] = useState<string | null>(null);
  const [resData, setResData] = useState<ResilienceModeResponse | null>(null);
  const [resMode, setResMode] = useState<ResilienceMode>("normal");

  const [decisionOpen, setDecisionOpen] = useState(false);
  const [decisionBusy, setDecisionBusy] = useState(false);
  const [decisionErr, setDecisionErr] = useState<string | null>(null);
  const [pendingDecision, setPendingDecision] = useState<null | {
    decision_type:
      | "capacity_settings"
      | "spillover_zips"
      | "os_levers"
      | "autopilot_toggle"
      | "resilience_mode"
      | "growth_ceiling"
      | "other";
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

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/owner/control", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ControlData | null;
      if (!res.ok || !json?.ok) throw new Error((json as any)?.error || "Failed to load owner control");
      setData(json);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  async function loadAway() {
    setAwayLoading(true);
    try {
      const res = await fetch("/api/owner/away", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as any;
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to load Owner Away mode");
      setAway(json.setting || null);
      setAwayLastSession(json.last_session || null);
      setAwayError(null);
    } catch (e) {
      setAwayError(e instanceof Error ? e.message : "Failed to load Owner Away mode");
      setAway(null);
      setAwayLastSession(null);
    } finally {
      setAwayLoading(false);
    }
  }

  async function loadCapacity() {
    setCapLoading(true);
    try {
      const res = await fetch("/api/capacity/settings", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as CapacitySettingsResponse | null;
      if (!res.ok || !json?.ok) throw new Error((json as any)?.error || "Failed to load capacity settings");
      setCapData(json);
      setDemandThrottle(json.settings.demand_throttle || "normal");
      setCrewCapacityJobs(json.settings.crew_capacity_jobs === null ? "" : String(json.settings.crew_capacity_jobs));
      setCapError(null);
    } catch (e) {
      setCapError(e instanceof Error ? e.message : "Failed to load capacity settings");
      setCapData(null);
    } finally {
      setCapLoading(false);
    }
  }

  async function loadAutopilot() {
    setApLoading(true);
    try {
      const res = await fetch("/api/autopilot", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as AutopilotStatusResponse | null;
      if (!res.ok || !json?.ok) throw new Error((json as any)?.error || "Failed to load AUTOPILOT");
      setApData(json);
      setApError(null);
    } catch (e) {
      setApError(e instanceof Error ? e.message : "Failed to load AUTOPILOT");
      setApData(null);
    } finally {
      setApLoading(false);
    }
  }

  async function loadSpilloverZips() {
    setSpillLoading(true);
    try {
      const res = await fetch("/api/capacity/spillover-zips", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as SpilloverZipsResponse | null;
      if (!res.ok || !json?.ok) throw new Error((json as any)?.error || "Failed to load spillover zips");
      setSpillData(json);
      setSpillError(null);
    } catch (e) {
      setSpillError(e instanceof Error ? e.message : "Failed to load spillover zips");
      setSpillData(null);
    } finally {
      setSpillLoading(false);
    }
  }

  async function loadResilienceMode() {
    setResLoading(true);
    try {
      const res = await fetch("/api/resilience/mode", { cache: "no-store" });
      const json = (await res.json().catch(() => null)) as ResilienceModeResponse | null;
      if (!res.ok || !json?.ok) throw new Error((json as any)?.error || "Failed to load Storm/Surge mode");
      setResData(json);
      setResMode(json.resilience.mode || "normal");
      setResError(null);
    } catch (e) {
      setResError(e instanceof Error ? e.message : "Failed to load Storm/Surge mode");
      setResData(null);
      setResMode("normal");
    } finally {
      setResLoading(false);
    }
  }

  useEffect(() => {
    load();
    loadAway();
    loadCapacity();
    loadSpilloverZips();
    loadResilienceMode();
    loadAutopilot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hot = useMemo(() => data?.hot_homeowners ?? [], [data]);
  const estimates = useMemo(() => data?.estimates ?? [], [data]);
  const m = data?.metrics;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <header className="flex flex-col gap-3">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Owner Control</h1>
            <p className="text-sm text-muted-foreground">
              Run the business in 5 minutes: reply → check estimates → done.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/dashboard/control-tower">
              <Button variant="outline">Control Tower</Button>
            </Link>
            <Link href="/dashboard/founder-exit">
              <Button variant="outline">Founder Exit</Button>
            </Link>
            <Button variant="outline" onClick={load} disabled={loading}>
              Refresh
            </Button>
          </div>
        </div>

        <div className="rounded-lg border bg-white p-4">
          <div className="text-xs font-semibold text-gray-900">5-minute loop</div>
          <div className="mt-2 grid gap-2 md:grid-cols-3 text-sm">
            <div className="rounded-md border bg-gray-50 px-3 py-2">1) Reply to hot homeowners</div>
            <div className="rounded-md border bg-gray-50 px-3 py-2">2) Check estimates in play</div>
            <div className="rounded-md border bg-gray-50 px-3 py-2">3) Close app</div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link href="/dashboard/inbox-unified?filter=hot_lead">
              <Button>Reply to hot homeowners</Button>
            </Link>
            <Link href="/dashboard/estimates">
              <Button variant="outline">Check estimates</Button>
            </Link>
          </div>
        </div>

        <div className="rounded-lg border bg-white p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-semibold text-gray-900">AUTOPILOT</div>
              <div className="mt-1 text-sm text-muted-foreground">
                When ON: you can’t pause, throttle, or tweak. Reply → approve estimates → close jobs.
              </div>
              {apData?.autopilot?.enabled ? (
                <div className="mt-2 text-sm font-semibold text-emerald-700">
                  ON{apData.autopilot.locked ? " (LOCKED)" : ""} • {apData.autopilot.days_in_autopilot}d
                  {apData.autopilot.days_until_lock !== null ? ` • locks in ${apData.autopilot.days_until_lock}d` : ""}
                </div>
              ) : (
                <div className="mt-2 text-sm font-semibold text-slate-700">OFF</div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={loadAutopilot} disabled={apLoading}>
                Refresh
              </Button>
              <Button
                onClick={async () => {
                  const enabled = Boolean(apData?.autopilot?.enabled);
                  openDecision({
                    decision_type: "autopilot_toggle",
                    action_label: enabled ? "Disable AUTOPILOT" : "Enable AUTOPILOT",
                    proposed_changes: { enabled: !enabled },
                    context: { autopilot: apData?.autopilot ?? null },
                    onAct: async (decisionId) => {
                      setApSaving(true);
                      try {
                        const res = await fetch("/api/autopilot", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ enabled: !enabled, decision_id: decisionId }),
                        });
                        const json = (await res.json().catch(() => null)) as any;
                        if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to toggle AUTOPILOT");
                        setApData(json as AutopilotStatusResponse);
                        setApError(null);
                      } finally {
                        setApSaving(false);
                      }
                    },
                  });
                }}
                disabled={apSaving || apLoading}
              >
                {apSaving ? "Saving…" : apData?.autopilot?.enabled ? "Turn OFF" : "Turn ON"}
              </Button>
            </div>
          </div>
          {apError ? (
            <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">{apError}</div>
          ) : null}
        </div>

        <div className="rounded-lg border bg-white p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-semibold text-gray-900">Capacity control</div>
              <div className="mt-1 text-sm text-muted-foreground">
                Set volume to match crew capacity. No calendars. No schedules.
              </div>
              {capData?.status?.is_full ? (
                <div className="mt-2 text-sm font-semibold text-red-700">
                  {capData.status.message || "Demand exceeds availability."}
                </div>
              ) : null}
            </div>
            <Button
              variant="outline"
              onClick={async () => {
                openDecision({
                  decision_type: "capacity_settings",
                  action_label: "Change capacity settings (volume/capacity)",
                  proposed_changes: {
                    demand_throttle: demandThrottle,
                    crew_capacity_jobs: crewCapacityJobs === "" ? null : Number(crewCapacityJobs),
                    reason: capReason || null,
                  },
                  context: {
                    capacity_status: capData?.status ?? null,
                    autopilot: apData?.autopilot ?? null,
                  },
                  onAct: async (decisionId) => {
                    setCapSaving(true);
                    try {
                      if (!capReason) throw new Error("Select a reason.");
                      const res = await fetch("/api/capacity/settings", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          decision_id: decisionId,
                          demand_throttle: demandThrottle,
                          crew_capacity_jobs: crewCapacityJobs === "" ? null : Number(crewCapacityJobs),
                          reason: capReason,
                        }),
                      });
                      const json = (await res.json().catch(() => null)) as any;
                      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to save");
                      setCapData(json as CapacitySettingsResponse);
                      setCapError(null);
                    } finally {
                      setCapSaving(false);
                    }
                  },
                });
              }}
              disabled={capSaving || Boolean(apData?.autopilot?.enabled)}
            >
              {capSaving ? "Saving…" : "Save"}
            </Button>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <div className="space-y-1 md:col-span-3">
              <div className="text-xs font-semibold text-gray-900">Reason (required)</div>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={capReason}
                onChange={(e) => setCapReason(e.target.value)}
                disabled={capLoading || capSaving || Boolean(apData?.autopilot?.enabled)}
              >
                <option value="">Select…</option>
                <option value="capacity_change">Capacity change</option>
                <option value="crew_change">Crew change</option>
                <option value="geographic_expansion">Geographic expansion</option>
              </select>
            </div>
            <div className="space-y-1">
              <div className="text-xs font-semibold text-gray-900">Demand throttle</div>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={demandThrottle}
                onChange={(e) => setDemandThrottle(e.target.value as any)}
              disabled={capLoading || Boolean(apData?.autopilot?.enabled)}
              >
                <option value="low">LOW</option>
                <option value="normal">NORMAL</option>
                <option value="high">HIGH</option>
              </select>
            </div>

            <div className="space-y-1">
              <div className="text-xs font-semibold text-gray-900">Crew capacity (jobs)</div>
              <input
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                inputMode="numeric"
                value={crewCapacityJobs}
                onChange={(e) => setCrewCapacityJobs(e.target.value.replace(/[^\d]/g, ""))}
                placeholder="e.g. 12"
                disabled={capLoading || Boolean(apData?.autopilot?.enabled)}
              />
            </div>

            <div className="space-y-1">
              <div className="text-xs font-semibold text-gray-900">Booked jobs (open)</div>
              <div className="rounded-md border bg-gray-50 px-3 py-2 text-sm">
                {capLoading ? "Loading…" : capData ? capData.status.jobs_booked_open : "—"}
              </div>
            </div>
          </div>

          {capError ? (
            <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">{capError}</div>
          ) : null}

          <div className="mt-4 border-t pt-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-gray-900">Spillover zip codes</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  When you’re full, redirect demand geographically instead of shutting it down.
                </div>
              </div>
              <Button variant="outline" onClick={loadSpilloverZips} disabled={spillLoading} size="sm">
                {spillLoading ? "Loading…" : "Refresh"}
              </Button>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                className="w-32 rounded-md border border-input bg-background px-3 py-2 text-sm"
                inputMode="numeric"
                placeholder="ZIP"
                value={spillZip}
                onChange={(e) => setSpillZip(e.target.value.replace(/[^\d]/g, "").slice(0, 5))}
              />
              <Button
                size="sm"
                onClick={async () => {
                  const zip = spillZip.trim();
                  if (zip.length !== 5) return;
                  openDecision({
                    decision_type: "spillover_zips",
                    action_label: `Add spillover ZIP ${zip}`,
                    proposed_changes: { zip, is_active: true },
                    context: { spillover_rows: spillData?.rows ?? [] },
                    onAct: async (decisionId) => {
                      await fetch("/api/capacity/spillover-zips", {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ zip, is_active: true, decision_id: decisionId }),
                      });
                      setSpillZip("");
                      await loadSpilloverZips();
                    },
                  });
                }}
              >
                Add
              </Button>
            </div>

            <div className="mt-3 space-y-2">
              {spillError ? (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">{spillError}</div>
              ) : null}
              {!spillError && (spillData?.rows?.length ?? 0) === 0 ? (
                <div className="text-sm text-muted-foreground">No spillover zips yet.</div>
              ) : null}
              {(spillData?.rows || []).map((r) => (
                <div key={r.zip} className="flex items-center justify-between rounded-md border bg-white px-3 py-2">
                  <div className="text-sm font-semibold tabular-nums">{r.zip}</div>
                  <Button
                    size="sm"
                    variant={r.is_active ? "outline" : "default"}
                    onClick={async () => {
                      openDecision({
                        decision_type: "spillover_zips",
                        action_label: `${r.is_active ? "Disable" : "Enable"} spillover ZIP ${r.zip}`,
                        proposed_changes: { zip: r.zip, is_active: !r.is_active },
                        context: { spillover_rows: spillData?.rows ?? [] },
                        onAct: async (decisionId) => {
                          await fetch("/api/capacity/spillover-zips", {
                            method: "PUT",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ zip: r.zip, is_active: !r.is_active, decision_id: decisionId }),
                          });
                          await loadSpilloverZips();
                        },
                      });
                    }}
                  >
                    {r.is_active ? "ON" : "OFF"}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Block 271400 — Storm / Surge mode */}
        <div className="rounded-lg border bg-white p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-semibold text-gray-900">Storm / Surge</div>
              <div className="mt-1 text-sm text-muted-foreground">
                No thinking required. SmartSend throttles outbound safely and prioritizes urgent homeowner replies.
              </div>
              {resMode !== "normal" ? (
                <div className="mt-2 text-sm font-semibold text-slate-800">
                  Active: {resMode.toUpperCase()} • outbound throttle:{" "}
                  {String(resData?.resilience?.demand_throttle_effective || "normal").toUpperCase()}
                </div>
              ) : (
                <div className="mt-2 text-sm font-semibold text-emerald-700">Normal</div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={loadResilienceMode} disabled={resLoading}>
                Refresh
              </Button>
              <Button
                onClick={async () => {
                  openDecision({
                    decision_type: "resilience_mode",
                    action_label: `Set Storm/Surge mode to ${resMode.toUpperCase()}`,
                    proposed_changes: { mode: resMode },
                    context: { resilience: resData?.resilience ?? null, autopilot: apData?.autopilot ?? null },
                    onAct: async (decisionId) => {
                      setResSaving(true);
                      try {
                        const res = await fetch("/api/resilience/mode", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ mode: resMode, decision_id: decisionId }),
                        });
                        const json = (await res.json().catch(() => null)) as any;
                        if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to save Storm/Surge mode");
                        setResData(json as ResilienceModeResponse);
                        setResMode((json as any)?.resilience?.mode || "normal");
                        setResError(null);
                      } finally {
                        setResSaving(false);
                      }
                    },
                  });
                }}
                disabled={resSaving || resLoading}
              >
                {resSaving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <div className="text-xs font-semibold text-gray-900">Mode</div>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={resMode}
                onChange={(e) => setResMode(e.target.value as ResilienceMode)}
                disabled={resLoading}
              >
                <option value="normal">NORMAL</option>
                <option value="storm">STORM</option>
                <option value="surge">SURGE</option>
              </select>
              <div className="text-[11px] text-muted-foreground">
                Storm: protect ops (slower outbound). Surge: controlled higher volume.
              </div>
            </div>
            <div className="space-y-1 md:col-span-2">
              <div className="text-xs font-semibold text-gray-900">Proof (passive)</div>
              <div className="rounded-md border bg-gray-50 px-3 py-2 text-sm text-gray-700">
                Outreach continued during operational disruption.
              </div>
            </div>
          </div>

          {resError ? (
            <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">{resError}</div>
          ) : null}
        </div>

        {/* Block 271200 — Owner Away Mode */}
        <div className="rounded-lg border bg-white p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-semibold text-gray-900">Owner Away</div>
              <div className="mt-1 text-sm text-muted-foreground">
                System keeps running. Replies are held. Only urgent hot leads escalate.
              </div>
              {away?.enabled && away?.started_at ? (
                <div className="mt-2 text-sm font-semibold text-amber-700">
                  ON since {new Date(away.started_at).toLocaleString()}
                </div>
              ) : (
                <div className="mt-2 text-sm font-semibold text-emerald-700">OFF</div>
              )}
              {awayLastSession?.ended_at ? (
                <div className="mt-1 text-xs text-muted-foreground">
                  Last away ended {new Date(awayLastSession.ended_at).toLocaleString()}.
                  {" "}
                  <Link href="/dashboard/owner/continuity" className="underline">
                    View continuity proof
                  </Link>
                </div>
              ) : null}
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={loadAway} disabled={awayLoading}>
                Refresh
              </Button>
              <Button
                onClick={async () => {
                  setAwaySaving(true);
                  try {
                    const res = await fetch("/api/owner/away", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ enabled: !away?.enabled }),
                    });
                    const json = (await res.json().catch(() => null)) as any;
                    if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to toggle");
                    setAway(json.setting || null);
                    // Refresh last session so the proof link appears immediately after turning off
                    await loadAway();
                  } catch (e) {
                    setAwayError(e instanceof Error ? e.message : "Failed to toggle");
                  } finally {
                    setAwaySaving(false);
                  }
                }}
                disabled={awaySaving || awayLoading}
              >
                {awaySaving ? "Saving…" : away?.enabled ? "Turn OFF" : "Turn ON"}
              </Button>
            </div>
          </div>

          {awayError ? (
            <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">{awayError}</div>
          ) : null}
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Are jobs coming in?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-sm text-muted-foreground">Avg homeowners per week</div>
            <div className="text-3xl font-semibold tabular-nums">{m ? m.avg_homeowners_per_week : "—"}</div>
            <div className="text-sm text-muted-foreground mt-3">Avg booked jobs per week</div>
            <div className="text-3xl font-semibold tabular-nums">{m ? m.avg_booked_jobs_per_week : "—"}</div>
            <div className="mt-2 text-xs text-muted-foreground">
              History only. No forecasts. No promises.
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>What needs attention today?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">Hot homeowners waiting</div>
              <div className="text-3xl font-semibold tabular-nums">{m ? m.hot_homeowners_waiting : "—"}</div>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">Jobs in estimate stage</div>
              <div className="text-3xl font-semibold tabular-nums">{m ? m.estimates_in_stage : "—"}</div>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              Operator levers: throttle (send), scale (volume), pressure (follow-up).
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>How much money is moving?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">Estimated value in play (today)</div>
              <div className="text-2xl font-semibold tabular-nums">{m ? money(m.value_in_play_today) : "—"}</div>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">Estimated value in play (week)</div>
              <div className="text-2xl font-semibold tabular-nums">{m ? money(m.value_in_play_week) : "—"}</div>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              As of {data?.as_of ? new Date(data.as_of).toLocaleString() : "—"}
            </div>
          </CardContent>
        </Card>
      </section>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          {error}
        </div>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Hot homeowners waiting</CardTitle>
            <Link href="/dashboard/inbox-unified?filter=hot_lead" className="text-sm text-muted-foreground hover:underline">
              Open inbox
            </Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {hot.length === 0 ? (
              <div className="text-sm text-muted-foreground">None right now.</div>
            ) : (
              hot.map((h) => (
                <div key={h.id} className="rounded-lg border bg-white p-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{h.homeowner_name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {h.subject} • {timeAgo(h.created_at)}
                      {h.read_at ? "" : " • unread"}
                    </div>
                    <div className="mt-1 text-sm text-gray-700 line-clamp-2">{h.snippet}</div>
                  </div>
                  <Link href={`/dashboard/inbox-unified?filter=hot_lead&mid=${encodeURIComponent(h.id)}`}>
                    <Button size="sm">Reply</Button>
                  </Link>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Jobs in estimate stage</CardTitle>
            <Link href="/dashboard/estimates" className="text-sm text-muted-foreground hover:underline">
              Open estimates
            </Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {estimates.length === 0 ? (
              <div className="text-sm text-muted-foreground">No estimates in play.</div>
            ) : (
              estimates.map((e) => (
                <div key={e.id} className="rounded-lg border bg-white p-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{e.homeowner_name || e.homeowner_email || `Estimate ${e.id.slice(0, 8)}`}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {String(e.status || "draft").toUpperCase()} • {money(e.total)} • created {timeAgo(e.created_at)}
                      {e.sent_at ? ` • sent ${timeAgo(e.sent_at)}` : ""}
                    </div>
                  </div>
                  <Link href={`/dashboard/estimates/${encodeURIComponent(e.id)}`}>
                    <Button size="sm" variant="outline">Open</Button>
                  </Link>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </section>

      {/* Act or Accept modal (Block 274100) */}
      {decisionOpen && pendingDecision ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-xl rounded-xl border bg-white shadow-xl">
            <div className="border-b px-5 py-4">
              <div className="text-xs font-semibold text-gray-600">CONTROL TOWER</div>
              <div className="mt-1 text-lg font-bold text-gray-900">Act or Accept</div>
              <div className="mt-1 text-sm text-gray-600">
                {pendingDecision.action_label}
              </div>
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
    </div>
  );
}








