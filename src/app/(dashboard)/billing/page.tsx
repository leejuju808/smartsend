"use client";

import useSWR from "swr";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useEffect, useState } from "react";

const fetcher = (u: string) => fetch(u).then(r => r.json());

function formatMoney(n: number, currency: string | null) {
  const ccy = (currency || "USD").toUpperCase();
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: ccy,
      maximumFractionDigits: 0,
    }).format(Number.isFinite(n) ? n : 0);
  } catch {
    return `$${Math.round(Number.isFinite(n) ? n : 0).toLocaleString()}`;
  }
}

export default function BillingPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [showCancel, setShowCancel] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);

  useEffect(() => {
    fetch("/api/auth/get-user")
      .then(r => r.json())
      .then(data => setUserId(data.userId || null))
      .catch(() => setUserId(null));
  }, []);

  useEffect(() => {
    try {
      const active = localStorage.getItem("active_workspace");
      setWorkspaceId(active || null);
    } catch {
      setWorkspaceId(null);
    }
  }, []);

  const { data, error } = useSWR(
    userId ? `/api/billing/summary?user=${userId}` : null,
    fetcher,
    { refreshInterval: 15000 }
  );

  const s = data?.summary;

  const { data: proof } = useSWR(
    workspaceId ? `/api/billing/proof?workspace_id=${encodeURIComponent(workspaceId)}` : null,
    fetcher,
    { refreshInterval: 30000 }
  );

  const { data: mirror } = useSWR(
    workspaceId ? `/api/outreach/mirror?workspace_id=${encodeURIComponent(workspaceId)}` : null,
    fetcher,
    { refreshInterval: 30000 }
  );

  const { data: lock } = useSWR(
    workspaceId ? `/api/billing/lock-metrics?workspace_id=${encodeURIComponent(workspaceId)}` : null,
    fetcher,
    { refreshInterval: 60000 }
  );

  async function openPortal() {
    if (!s?.stripe_customer_id) {
      alert("No customer ID found. Please contact support.");
      return;
    }

    const res = await fetch("/functions/v1/billing/portal-session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ customer_id: s.stripe_customer_id })
    });

    const j = await res.json();
    if (j?.url) {
      window.location.href = j.url;
    } else {
      alert("Failed to open billing portal: " + (j.error || "Unknown error"));
    }
  }

  const pct = s ? Math.min(100, Math.round((s.emails_sent_today / (s.usage_soft_cap || 1)) * 100)) : 0;
  const mirrorMetrics = mirror?.metrics || null;
  const mirrorEmails = mirrorMetrics?.emails_sent ?? null;
  const mirrorReplies = mirrorMetrics?.replies ?? null;
  const mirrorJobs = mirrorMetrics?.jobs_booked ?? null;
  const mirrorValue = mirrorMetrics?.estimated_value ?? null;

  const optimizingDays = typeof lock?.optimizing_days === "number" ? lock.optimizing_days : null;
  const hasCanceledBefore = Boolean(lock?.cancellation?.has_canceled_before);
  const outreachState = String(lock?.outreach?.state || "");
  const showReturnWarmup = hasCanceledBefore && outreachState === "running";

  if (!userId) {
    return (
      <div className="max-w-3xl mx-auto p-4">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-6">
      <Card className="p-5 space-y-3">
        <div className="text-lg font-semibold">What happens if you stop?</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="text-sm">
            <div className="text-muted-foreground text-xs">Homeowners contacted (30d)</div>
            <div className="font-semibold">{typeof mirrorEmails === "number" ? mirrorEmails.toLocaleString() : "—"}</div>
          </div>
          <div className="text-sm">
            <div className="text-muted-foreground text-xs">Homeowners responding (30d)</div>
            <div className="font-semibold">{typeof mirrorReplies === "number" ? mirrorReplies.toLocaleString() : "—"}</div>
          </div>
          <div className="text-sm">
            <div className="text-muted-foreground text-xs">Jobs booked (30d)</div>
            <div className="font-semibold">{typeof mirrorJobs === "number" ? mirrorJobs.toLocaleString() : "—"}</div>
          </div>
          <div className="text-sm">
            <div className="text-muted-foreground text-xs">Estimated value (30d)</div>
            <div className="font-semibold">
              {typeof mirrorValue === "number" ? formatMoney(mirrorValue, "USD") : "—"}
            </div>
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          This activity only exists while SmartSend is running.
        </div>
      </Card>

      <Card className="p-5 space-y-3">
        <div className="text-lg font-semibold">If SmartSend stops</div>
        <ul className="text-sm space-y-1">
          <li>Outreach stops</li>
          <li>Follow-ups stop</li>
          <li>Job creation stops</li>
          <li>Forecast goes dark</li>
        </ul>
        <div className="text-xs text-muted-foreground">
          This is operational: automated sending, reply handling, booking flow, and dashboards stop updating when outreach is paused.
        </div>
      </Card>

      <Card className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-lg font-semibold">Data gravity lock</div>
            <div className="text-xs text-muted-foreground">
              SmartSend holds the raw history; the value is the system running on it.
            </div>
          </div>
          <Button
            size="sm"
            variant="secondary"
            disabled={!workspaceId}
            onClick={() => {
              if (!workspaceId) return;
              window.location.href = `/api/billing/raw-export?workspace_id=${encodeURIComponent(workspaceId)}`;
            }}
          >
            Export raw data
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="text-sm">
            <div className="text-muted-foreground text-xs">Leads</div>
            <div className="font-semibold">{typeof lock?.data_counts?.leads === "number" ? lock.data_counts.leads.toLocaleString() : "—"}</div>
          </div>
          <div className="text-sm">
            <div className="text-muted-foreground text-xs">Campaigns</div>
            <div className="font-semibold">{typeof lock?.data_counts?.campaigns === "number" ? lock.data_counts.campaigns.toLocaleString() : "—"}</div>
          </div>
          <div className="text-sm">
            <div className="text-muted-foreground text-xs">Appointments</div>
            <div className="font-semibold">{typeof lock?.data_counts?.appointments === "number" ? lock.data_counts.appointments.toLocaleString() : "—"}</div>
          </div>
        </div>

        <ul className="text-sm space-y-1">
          <li>Job history</li>
          <li>Conversion patterns</li>
          <li>City performance</li>
          <li>Revenue attribution</li>
        </ul>

        <div className="text-xs text-muted-foreground">
          Export is available, but it’s a dump — not a working system.
        </div>

        <div className="text-xs text-muted-foreground">
          {optimizingDays != null ? (
            <>
              This system has been optimizing for <span className="font-semibold">{optimizingDays}</span>{" "}
              day{optimizingDays === 1 ? "" : "s"}. No reset button.
            </>
          ) : (
            <>This system has been optimizing for — days. No reset button.</>
          )}
        </div>
      </Card>

      {showReturnWarmup && (
        <Card className="p-5 space-y-2">
          <div className="text-lg font-semibold">Return note</div>
          <div className="text-sm text-muted-foreground">
            If you pause/cancel and return, momentum isn’t instant.
          </div>
          <ul className="text-sm space-y-1">
            <li>Warm-up required</li>
            <li>Performance ramps again</li>
            <li>Automations rebuild their timing and routing from fresh activity</li>
          </ul>
        </Card>
      )}

      <Card className="p-5 space-y-3">
        <div className="text-lg font-semibold">This Month (Proof)</div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div className="text-sm">
            <div className="text-muted-foreground text-xs">Homeowners contacted</div>
            <div className="font-semibold">{proof?.metrics?.emails_sent?.toLocaleString?.() ?? "—"}</div>
          </div>
          <div className="text-sm">
            <div className="text-muted-foreground text-xs">Homeowners responding</div>
            <div className="font-semibold">{proof?.metrics?.replies?.toLocaleString?.() ?? "—"}</div>
          </div>
          <div className="text-sm">
            <div className="text-muted-foreground text-xs">Hot + Warm</div>
            <div className="font-semibold">{proof?.metrics?.hot_warm?.toLocaleString?.() ?? "—"}</div>
          </div>
          <div className="text-sm">
            <div className="text-muted-foreground text-xs">Jobs booked</div>
            <div className="font-semibold">{proof?.metrics?.jobs_booked?.toLocaleString?.() ?? "—"}</div>
          </div>
          <div className="text-sm">
            <div className="text-muted-foreground text-xs">Estimated job value</div>
            <div className="font-semibold">
              {typeof proof?.metrics?.estimated_job_value === "number"
                ? formatMoney(proof.metrics.estimated_job_value, "USD")
                : "—"}
            </div>
          </div>
          <div className="text-sm">
            <div className="text-muted-foreground text-xs">Amount due</div>
            <div className="font-semibold">
              {typeof proof?.amount_due === "number" ? formatMoney(proof.amount_due, proof.currency) : "—"}
            </div>
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          The activity above originated from SmartSend reaching homeowners.
        </div>
      </Card>

      <Card className="p-5 space-y-2">
        <div className="text-lg font-semibold">Current Plan</div>
        <div className="text-sm">Plan: {s?.plan_name ?? "—"}</div>
        <div className="text-sm">Status: {s?.status ?? "—"}</div>
        <div className="text-sm">Next renewal: {s?.period_end ? new Date(s.period_end).toLocaleString() : "—"}</div>
        <div className="text-sm mt-2">Daily Usage</div>
        <div className="w-full h-2 bg-muted rounded">
          <div className="h-2 bg-primary rounded" style={{ width: `${pct}%` }} />
        </div>
        <div className="text-xs text-muted-foreground">
          {s?.emails_sent_today ?? 0} / {s?.usage_soft_cap ?? 0} homeowners contacted today
        </div>
        <div className="flex gap-2 pt-2">
          <Button size="sm" onClick={openPortal}>Manage Subscription</Button>
          <Button size="sm" variant="secondary" onClick={() => setShowCancel(true)}>
            Cancel
          </Button>
        </div>
      </Card>

      {showCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-lg border border-gray-200">
            <div className="p-5 space-y-3">
              <div className="text-lg font-semibold">Cancel SmartSend</div>
              <div className="text-sm text-gray-700">
                Outreach will stop immediately.
              </div>

              <div className="mt-2 grid grid-cols-2 gap-3">
                <div className="text-sm">
                  <div className="text-muted-foreground text-xs">Homeowners contacted (30d)</div>
                  <div className="font-semibold">{typeof mirrorEmails === "number" ? mirrorEmails.toLocaleString() : "—"}</div>
                </div>
                <div className="text-sm">
                  <div className="text-muted-foreground text-xs">Homeowners responding (30d)</div>
                  <div className="font-semibold">{typeof mirrorReplies === "number" ? mirrorReplies.toLocaleString() : "—"}</div>
                </div>
                <div className="text-sm">
                  <div className="text-muted-foreground text-xs">Jobs booked (30d)</div>
                  <div className="font-semibold">{typeof mirrorJobs === "number" ? mirrorJobs.toLocaleString() : "—"}</div>
                </div>
                <div className="text-sm">
                  <div className="text-muted-foreground text-xs">Estimated value (30d)</div>
                  <div className="font-semibold">
                    {typeof mirrorValue === "number" ? formatMoney(mirrorValue, "USD") : "—"}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={cancelBusy}
                  onClick={() => setShowCancel(false)}
                >
                  Back
                </Button>
                <Button
                  size="sm"
                  disabled={cancelBusy || !workspaceId}
                  onClick={async () => {
                    if (!workspaceId) return;
                    setCancelBusy(true);
                    try {
                      const res = await fetch("/api/billing/cancel", {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ workspace_id: workspaceId }),
                      });
                      const j = await res.json().catch(() => ({}));
                      if (!res.ok) {
                        alert(j?.error || "Cancel failed");
                        return;
                      }
                      setShowCancel(false);
                      // Send them back into the dashboard; the layout will render the silence state.
                      window.location.href = "/dashboard";
                    } finally {
                      setCancelBusy(false);
                    }
                  }}
                >
                  {cancelBusy ? "Canceling…" : "Cancel now"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {error && (
        <div className="text-sm text-red-600">
          Error loading billing data: {error.message || "Unknown error"}
        </div>
      )}
    </div>
  );
}
