"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScaleReadinessCard } from "@/components/dashboard/ScaleReadinessCard";
import { CatchingUpImpossibleCard } from "@/components/dashboard/CatchingUpImpossibleCard";
import { useDemoMode } from "@/hooks/useDemoMode";
import { CaseStudyCarousel } from "@/components/demo/CaseStudyCarousel";
import { CityAccessIndicator } from "@/components/CityAccessIndicator";

type QueueItem = {
  id: string;
  item_type: "hot_reply" | "stalled_estimate" | "followup_due" | string;
  urgency: number;
  revenue_potential: number | string | null;
  waiting_seconds: number | string | null;

  lead_id: string | null;
  lead_name: string | null;
  lead_email: string | null;
  homeowner_id: string | null;
  estimate_id: string | null;
  thread_id?: string | null;

  estimate_sent_at: string | null;
  estimate_status: string | null;
  estimate_followup_status: string | null;
  next_followup_at: string | null;
  next_followup_step: number | null;
  followup_message_preview: string | null;
  sent_to_email: string | null;
  decision_reason?: string | null;
};

type Summary = {
  total_action_items: number;
  hot_leads_needing_response: number;
  estimates_waiting_on_approval: number;
  followups_sending_today: number;
  potential_revenue_at_risk: number;
};

type ProofStack = {
  emails_sent_all_time: number;
  replies_all_time: number;
  hot_all_time: number;
  warm_all_time: number;
  jobs_booked_all_time: number;
  estimated_value_all_time: number;
  as_of?: string | null;
};

type AutopilotStatus = {
  paused_campaigns_count: number;
  guard_paused_campaigns_count: number;
};

function money(v: unknown) {
  const n = typeof v === "number" ? v : Number(String(v ?? "0"));
  if (!Number.isFinite(n)) return "$0";
  return n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function daysFromSeconds(v: unknown) {
  const n = typeof v === "number" ? v : Number(String(v ?? "0"));
  if (!Number.isFinite(n) || n <= 0) return "0d";
  return `${Math.floor(n / 86400)}d`;
}

export default function TodayOperatorClient() {
  const isDemo = useDemoMode();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [proof, setProof] = useState<ProofStack | null>(null);
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [autopilot, setAutopilot] = useState<AutopilotStatus>({ paused_campaigns_count: 0, guard_paused_campaigns_count: 0 });
  const [extensionConnected, setExtensionConnected] = useState<boolean | null>(null);
  const [summary, setSummary] = useState<Summary>({
    total_action_items: 0,
    hot_leads_needing_response: 0,
    estimates_waiting_on_approval: 0,
    followups_sending_today: 0,
    potential_revenue_at_risk: 0,
  });

  const [messageOpen, setMessageOpen] = useState(false);
  const [messageText, setMessageText] = useState<string>("");
  const [messageMeta, setMessageMeta] = useState<string>("");
  const [scaleTier, setScaleTier] = useState<string | null>(null);
  const [scaleBlockers, setScaleBlockers] = useState<string[]>([]);

  const refresh = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/operator/daily-queue", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to load");
      setItems(json.items || []);
      setSummary(json.summary || summary);
      if (json.autopilot) setAutopilot(json.autopilot);
    } catch (e) {
      console.error(e);
      setItems([]);
      setSummary({
        total_action_items: 0,
        hot_leads_needing_response: 0,
        estimates_waiting_on_approval: 0,
        followups_sending_today: 0,
        potential_revenue_at_risk: 0,
      });
      setAutopilot({ paused_campaigns_count: 0, guard_paused_campaigns_count: 0 });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // BLOCK 271000 — Default Reality Sprint
  // If the Chrome extension is connected, new tabs can go straight to Daily (SmartSend as first tab).
  useEffect(() => {
    const loadExtensionStatus = async () => {
      try {
        const res = await fetch("/api/extension/status", { cache: "no-store" });
        if (!res.ok) {
          setExtensionConnected(null);
          return;
        }
        const json = await res.json().catch(() => null) as null | { has_token?: boolean };
        setExtensionConnected(!!json?.has_token);
      } catch {
        setExtensionConnected(null);
      }
    };
    loadExtensionStatus();
  }, []);

  useEffect(() => {
    const loadProof = async () => {
      try {
        const res = await fetch("/api/proof-stack", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json().catch(() => null)) as ProofStack | null;
        if (!json) return;
        setProof(json);
      } catch {
        // ignore
      }
    };
    loadProof();
  }, []);

  const hotReplies = useMemo(() => items.filter((i) => i.item_type === "hot_reply"), [items]);
  const stalled = useMemo(() => items.filter((i) => i.item_type === "stalled_estimate"), [items]);
  const due = useMemo(() => items.filter((i) => i.item_type === "followup_due"), [items]);

  // One-path daily flow (no branching): A → B → C → done.
  const stepCounts = useMemo(() => {
    return [hotReplies.length, stalled.length, due.length] as const;
  }, [hotReplies.length, stalled.length, due.length]);

  const canContinue = useMemo(() => {
    if (step === 0) return hotReplies.length === 0;
    if (step === 1) return stalled.length === 0;
    if (step === 2) return due.length === 0;
    return true;
  }, [step, hotReplies.length, stalled.length, due.length]);

  useEffect(() => {
    // Auto-advance when the current step is clear.
    if (loading) return;
    if (step === 0 && hotReplies.length === 0) setStep(1);
    if (step === 1 && stalled.length === 0) setStep(2);
    if (step === 2 && due.length === 0) setStep(3);
  }, [loading, step, hotReplies.length, stalled.length, due.length]);

  const nudgeEstimate = async (estimateId: string, toEmail: string) => {
    await fetch(`/api/estimates/${estimateId}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to_email: toEmail }),
    });
    await refresh();
  };

  const bannerText =
    summary.total_action_items > 0
      ? `You have ${summary.total_action_items} item${summary.total_action_items === 1 ? "" : "s"} that can turn into jobs today.`
      : "You’re clear for today. No action items.";

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <header className="flex flex-col gap-2">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Daily</h1>
            <p className="text-sm text-gray-600">Open SmartSend → clear homeowners waiting → leave.</p>
            <div className="mt-2 text-xs text-gray-500 space-y-1">
              <div>No decisions. The queue is sorted by money + urgency.</div>
              <div>If you do nothing, SmartSend keeps reaching homeowners + following up.</div>
              <div>Your only job: respond to real homeowners + close jobs.</div>
              <div className="pt-1 text-gray-600">
                If it’s not in SmartSend, it’s not real.
              </div>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <CityAccessIndicator variant="inline" />
            <div className="flex items-center gap-2">
              <Link href="/dashboard/founder-exit">
                <Button variant="outline">Founder Exit</Button>
              </Link>
              <Button variant="outline" onClick={refresh} disabled={loading}>
                Refresh
              </Button>
            </div>
          </div>
        </div>

        {/* Make SmartSend the first tab (extension-driven new tab override) */}
        {extensionConnected === false ? (
          <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900">
                  Make SmartSend your first tab
                </div>
                <div className="mt-1 text-xs text-slate-700">
                  Install + connect the Chrome extension so every new tab opens to <span className="font-semibold">Daily</span>.
                  That’s the whole point: SmartSend is already open when work starts.
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Link href="/extension/link">
                  <Button>Connect extension</Button>
                </Link>
                <a
                  href="/extension"
                  className="text-xs font-medium text-slate-700 underline underline-offset-2"
                >
                  Setup
                </a>
              </div>
            </div>
            <div className="mt-3 text-[11px] text-slate-600">
              Tip: In Chrome, pin this tab and set “On startup” → “Continue where you left off”.
            </div>
          </section>
        ) : null}

        {/* All-time proof stack (shown before recent numbers) */}
        {proof && (
          <section className="rounded-lg border bg-white p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-xs font-semibold text-gray-900">All-time</div>
                <div className="text-[11px] text-gray-500">Your results stack upward.</div>
              </div>
              {proof.as_of ? (
                <div className="text-[11px] text-gray-400">As of {new Date(proof.as_of).toLocaleDateString()}</div>
              ) : null}
            </div>
            <div className="mt-3 grid gap-3 grid-cols-2 md:grid-cols-6">
              <div className="rounded-lg border bg-white p-3">
                <div className="text-[11px] text-gray-500">Homeowners contacted</div>
                <div className="mt-1 text-xl font-semibold tabular-nums">{proof.emails_sent_all_time}</div>
              </div>
              <div className="rounded-lg border bg-white p-3">
                <div className="text-[11px] text-gray-500">Homeowners responding</div>
                <div className="mt-1 text-xl font-semibold tabular-nums">{proof.replies_all_time}</div>
              </div>
              <div className="rounded-lg border bg-white p-3">
                <div className="text-[11px] text-gray-500">Hot</div>
                <div className="mt-1 text-xl font-semibold tabular-nums">{proof.hot_all_time}</div>
              </div>
              <div className="rounded-lg border bg-white p-3">
                <div className="text-[11px] text-gray-500">Warm</div>
                <div className="mt-1 text-xl font-semibold tabular-nums">{proof.warm_all_time}</div>
              </div>
              <div className="rounded-lg border bg-white p-3">
                <div className="text-[11px] text-gray-500">Jobs booked</div>
                <div className="mt-1 text-xl font-semibold tabular-nums">{proof.jobs_booked_all_time}</div>
              </div>
              <div className="rounded-lg border bg-white p-3">
                <div className="text-[11px] text-gray-500">Estimated value</div>
                <div className="mt-1 text-xl font-semibold tabular-nums">{money(proof.estimated_value_all_time)}</div>
              </div>
            </div>
          </section>
        )}

        <div
          className={[
            "rounded-lg border p-4 text-sm",
            summary.total_action_items > 0 ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900",
          ].join(" ")}
        >
          {bannerText}
        </div>

        {/* Growth without emotion: explicit calm-state when autopilot is running */}
        {autopilot.paused_campaigns_count === 0 ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <div className="font-semibold">Autopilot is running</div>
            <div className="mt-1">
              Outreach keeps going. Replies keep coming. Follow-ups keep pressure on. No panic required.
            </div>
          </div>
        ) : null}

        {autopilot.paused_campaigns_count > 0 ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
            <div className="font-semibold">Autopilot is paused</div>
            <div className="mt-1">
              {autopilot.paused_campaigns_count} city outreach run{autopilot.paused_campaigns_count === 1 ? "" : "s"} {autopilot.paused_campaigns_count === 1 ? "is" : "are"} paused, so homeowner reach won’t continue automatically.
            </div>
            <div className="mt-3 flex items-center gap-2">
              <Link href="/dashboard/campaigns">
                <Button>Fix now</Button>
              </Link>
              <Link href="/dashboard/campaigns">
                <Button variant="outline">View city outreach</Button>
              </Link>
            </div>
          </div>
        ) : null}

        {scaleTier === "locked" && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
            <div className="font-semibold">Scale Locked</div>
            <div className="mt-1">
              Max outreach: 25/day. Pressure capped. SmartSend is protecting your reach while you earn scale.
            </div>
            {scaleBlockers.length > 0 && (
              <div className="mt-2 text-xs text-rose-900/90">
                Blocking scale: {scaleBlockers.slice(0, 2).join(" • ")}
              </div>
            )}
          </div>
        )}
      </header>

      {isDemo ? <CaseStudyCarousel /> : null}

      {/* Daily Summary Panel */}
      <section className="grid gap-3 md:grid-cols-4">
        <div className="rounded-lg border bg-white p-4">
          <div className="text-xs text-gray-500">🔥 Hot Homeowners Needing Response</div>
          <div className="mt-1 text-3xl font-semibold">{summary.hot_leads_needing_response}</div>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <div className="text-xs text-gray-500">⏰ Estimates Waiting on Approval</div>
          <div className="mt-1 text-3xl font-semibold">{summary.estimates_waiting_on_approval}</div>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <div className="text-xs text-gray-500">📤 Pressure Sending Today</div>
          <div className="mt-1 text-3xl font-semibold">{summary.followups_sending_today}</div>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <div className="text-xs text-gray-500">💰 Job Value at Risk</div>
          <div className="mt-1 text-3xl font-semibold">{money(summary.potential_revenue_at_risk)}</div>
        </div>
      </section>

      {/* Operator Mode Layout (single-path flow) */}
      <main className="grid gap-6 lg:grid-cols-3">
        {/* Left: One-path Daily Flow */}
        <section className="lg:col-span-2 space-y-4">
          <div className="rounded-lg border bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-gray-900">Daily Flow</div>
                <div className="text-[11px] text-gray-500">A → B → C. No alternate paths.</div>
              </div>
              <div className="text-xs text-gray-500 tabular-nums">
                A:{stepCounts[0]} • B:{stepCounts[1]} • C:{stepCounts[2]}
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="text-sm font-semibold">
                {step === 0 ? "A. Homeowners waiting" : step === 1 ? "B. Stalled estimates" : step === 2 ? "C. Pressure due today" : "Done"}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={refresh} disabled={loading}>
                  Refresh
                </Button>
                <Button
                  onClick={async () => {
                    await refresh();
                    if (step < 3 && canContinue) setStep((Math.min(3, (step + 1)) as any));
                  }}
                  disabled={loading || !canContinue}
                  title={!canContinue ? "Clear this step to continue." : "Continue"}
                >
                  Continue
                </Button>
              </div>
            </div>
            {!canContinue && step < 3 ? (
              <div className="mt-2 text-xs text-amber-700">
                Clear this step to continue. SmartSend runs follow-ups automatically—your job is to clear the waiting list.
              </div>
            ) : null}
            {step === 3 ? (
              <div className="mt-2 text-sm text-emerald-700">
                You’re done. Leave. SmartSend keeps running in the background.
              </div>
            ) : null}
          </div>

          {/* Step A */}
          {step === 0 ? (
            <div className="rounded-lg border bg-white">
              <div className="border-b px-4 py-3">
                <div className="font-semibold">A. Homeowners waiting</div>
                <div className="text-xs text-gray-500">System decided: who needs a reply first (money + urgency).</div>
              </div>
              <div className="divide-y">
                {loading ? (
                  <div className="p-4 text-sm text-gray-500">Loading…</div>
                ) : hotReplies.length === 0 ? (
                  <div className="p-4 text-sm text-gray-500">None.</div>
                ) : (
                  hotReplies.map((i) => (
                    <div key={i.id} className="px-4 py-3 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{i.lead_name || i.lead_email || "Hot lead"}</div>
                        <div className="text-xs text-gray-500 truncate">
                          {i.lead_email || "—"} • {money(i.revenue_potential)} • waiting {daysFromSeconds(i.waiting_seconds)}
                        </div>
                        {i.decision_reason ? (
                          <div className="mt-1 text-[11px] text-gray-500 truncate">{i.decision_reason}</div>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2">
                        {i.thread_id ? (
                          <Link href={`/inbox/${encodeURIComponent(String(i.thread_id))}`}>
                            <Button>Reply now</Button>
                          </Link>
                        ) : (
                          <Link href="/inbox">
                            <Button>Open inbox</Button>
                          </Link>
                        )}
                        <Link
                          href={`/dashboard/estimates?create=1${i.homeowner_id ? `&homeowner_id=${encodeURIComponent(i.homeowner_id)}` : ""}${
                            i.lead_email ? `&email=${encodeURIComponent(i.lead_email)}` : ""
                          }${i.lead_name ? `&name=${encodeURIComponent(i.lead_name)}` : ""}`}
                        >
                          <Button variant={i.thread_id ? "outline" : "default"}>Create estimate</Button>
                        </Link>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : null}

          {/* Step B */}
          {step === 1 ? (
            <div className="rounded-lg border bg-white">
              <div className="border-b px-4 py-3">
                <div className="font-semibold">B. Stalled estimates</div>
                <div className="text-xs text-gray-500">Sent 3+ days ago, not approved. SmartSend keeps pressure on.</div>
              </div>
              <div className="divide-y">
                {loading ? (
                  <div className="p-4 text-sm text-gray-500">Loading…</div>
                ) : stalled.length === 0 ? (
                  <div className="p-4 text-sm text-gray-500">None.</div>
                ) : (
                  stalled.map((i) => {
                    const id = i.estimate_id!;
                    const toEmail = String(i.sent_to_email || "").trim();
                    return (
                      <div key={i.id} className="px-4 py-3 flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <div className="font-medium truncate">Estimate {id.slice(0, 8)}</div>
                          <div className="text-xs text-gray-500 truncate">
                            {money(i.revenue_potential)} • waiting {daysFromSeconds(i.waiting_seconds)} • {i.estimate_followup_status || "active"}
                          </div>
                          {i.decision_reason ? (
                            <div className="mt-1 text-[11px] text-gray-500 truncate">{i.decision_reason}</div>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2">
                          <Link href={`/dashboard/estimates/${encodeURIComponent(id)}`}>
                            <Button variant="outline">View</Button>
                          </Link>
                          <Button
                            onClick={() => nudgeEstimate(id, toEmail)}
                            disabled={!toEmail || loading}
                            title={!toEmail ? "No homeowner contact address on file to nudge" : "Resend / nudge"}
                          >
                            Nudge
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ) : null}

          {/* Step C */}
          {step === 2 ? (
            <div className="rounded-lg border bg-white">
              <div className="border-b px-4 py-3">
                <div className="font-semibold">C. Pressure due today</div>
                <div className="text-xs text-gray-500">Read-only preview. SmartSend sends automatically.</div>
              </div>
              <div className="divide-y">
                {loading ? (
                  <div className="p-4 text-sm text-gray-500">Loading…</div>
                ) : due.length === 0 ? (
                  <div className="p-4 text-sm text-gray-500">None.</div>
                ) : (
                  due.map((i) => {
                    const id = i.estimate_id!;
                    const stepNum = i.next_followup_step ?? 1;
                    return (
                      <div key={i.id} className="px-4 py-3 flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <div className="font-medium truncate">Estimate {id.slice(0, 8)} • Pressure #{stepNum}</div>
                          <div className="text-xs text-gray-500 truncate">
                            {money(i.revenue_potential)} • scheduled {i.next_followup_at ? new Date(i.next_followup_at).toLocaleString() : "today"}
                          </div>
                          {i.decision_reason ? (
                            <div className="mt-1 text-[11px] text-gray-500 truncate">{i.decision_reason}</div>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            onClick={() => {
                              setMessageMeta(`Estimate ${id.slice(0, 8)} • Pressure #${stepNum}`);
                              setMessageText(i.followup_message_preview || "");
                              setMessageOpen(true);
                            }}
                          >
                            View message
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ) : null}
        </section>

        {/* Right: Revenue Snapshot */}
        <aside className="space-y-4">
          <ScaleReadinessCard
            onStatus={(s) => {
              setScaleTier(s?.tier ?? null);
              const blockers = (s?.blockers || []).map((b: any) => String(b?.label || "")).filter(Boolean);
              setScaleBlockers(blockers);
            }}
          />
          <CatchingUpImpossibleCard />
          <div className="rounded-lg border bg-white p-4">
            <div className="text-sm font-semibold">Job Value Snapshot</div>
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-600">At risk today</span>
                <span className="font-semibold">{money(summary.potential_revenue_at_risk)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Stalled estimates</span>
                <span className="font-semibold">{stalled.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600">Pressure due</span>
                <span className="font-semibold">{due.length}</span>
              </div>
            </div>
          </div>

          <div className="rounded-lg border bg-white p-4">
            <div className="text-sm font-semibold">Rules (system)</div>
            <ul className="mt-2 text-sm text-gray-600 space-y-1">
              <li>- A: Needs reply (threads flagged by the system)</li>
              <li>- B: Stalled estimates (3+ days, not approved)</li>
              <li>- C: Autopilot follow-ups due today (preview only)</li>
            </ul>
          </div>
        </aside>
      </main>

      <Dialog open={messageOpen} onOpenChange={setMessageOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{messageMeta || "Pressure message"}</DialogTitle>
            <DialogDescription>Read-only preview (v1)</DialogDescription>
          </DialogHeader>
          <div className="whitespace-pre-wrap rounded-md border bg-muted/20 p-3 text-sm text-gray-900">
            {messageText || "—"}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMessageOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}



