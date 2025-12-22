"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

type QueueRow = {
  id: number;
  status: string;
  scheduled_at: string;
  attempt: number;
  max_attempts: number;
  last_error: string | null;
  lead_id: string;
  identity_id: string;
  account_id: string;
};

type LeadInfo = {
  email: string;
  firstName: string | null;
  lastName: string | null;
};

type IdentitySummary = {
  id: string;
  email: string;
  provider: string;
  capacity: number;
  sentToday: number;
  sentLastMinute: number;
  updatedAt: string | null;
};

type SuppressionInfo = {
  expiresAt: string | null;
  reason: string;
};

type Props = {
  campaignId: string;
  canSend: boolean;
  initialQueue: QueueRow[];
  leadLookup: Record<string, LeadInfo>;
  identitySummaries: IdentitySummary[];
  suppressionLookup: Record<string, SuppressionInfo>;
};

const REFRESH_MS = 5000;

function formatLead(lead: LeadInfo | undefined) {
  if (!lead) return "Unknown lead";
  const name = [lead.firstName, lead.lastName].filter(Boolean).join(" ").trim();
  return name ? `${name} · ${lead.email}` : lead.email;
}

function formatDate(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function computeCapacity(info: {
  dailyLimit: number;
  warmupEnabled: boolean;
  warmupStage: number | null;
  warmupMaxStage: number | null;
}) {
  const limit = info.dailyLimit ?? 0;
  if (!info.warmupEnabled) return limit;
  const stage = info.warmupStage ?? 0;
  const max = info.warmupMaxStage ?? 0;
  if (max <= 0) return limit;
  const ratio = Math.min(1, Math.max(0, stage / max));
  return Math.floor(limit * ratio);
}

export default function QueueClient({
  campaignId,
  canSend,
  initialQueue,
  leadLookup,
  identitySummaries,
  suppressionLookup,
}: Props) {
  const supabase = createClientComponentClient();
  const [queue, setQueue] = useState<QueueRow[]>(initialQueue);
  const [leads, setLeads] = useState<Record<string, LeadInfo>>(leadLookup);
  const [identities, setIdentities] = useState<IdentitySummary[]>(identitySummaries);
  const [suppressions, setSuppressions] = useState<Record<string, SuppressionInfo>>(suppressionLookup);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data: queueRows, error: queueErr } = await supabase
      .from("send_queue")
      .select("id,status,scheduled_at,attempt,max_attempts,last_error,lead_id,identity_id,account_id")
      .eq("campaign_id", campaignId)
      .order("priority", { ascending: true })
      .order("scheduled_at", { ascending: true })
      .limit(500);

    if (queueErr) {
      setError(queueErr.message);
    setLoading(false);
      return;
    }

    const queueData = (queueRows ?? []) as QueueRow[];
    setQueue(queueData);
    setError(null);

    const accountId = queueData[0]?.account_id ?? null;
    const leadIds = Array.from(new Set(queueData.map((q) => q.lead_id).filter(Boolean)));
    const identityIds = Array.from(new Set(queueData.map((q) => q.identity_id).filter(Boolean)));

    const [{ data: leadsData }, { data: identityData }, { data: pacingData }] = await Promise.all([
      leadIds.length
        ? supabase.from("leads").select("id,email,first_name,last_name").in("id", leadIds)
        : Promise.resolve({ data: [] }),
      identityIds.length
        ? supabase
            .from("send_identities")
            .select("id,email,provider,daily_limit,warmup_enabled,warmup_stage,warmup_max_stage")
            .in("id", identityIds)
        : Promise.resolve({ data: [] }),
      identityIds.length
        ? supabase
            .from("identity_pacing")
            .select("identity_id,sent_today,sent_last_minute,updated_at")
            .in("identity_id", identityIds)
        : Promise.resolve({ data: [] }),
    ]);

    if (leadsData) {
      const leadMap: Record<string, LeadInfo> = {};
      for (const lead of leadsData as any[]) {
        leadMap[lead.id] = {
          email: lead.email,
          firstName: lead.first_name,
          lastName: lead.last_name,
        };
      }
      setLeads(leadMap);
    }

    if (identityData) {
      const pacingMap = new Map<string, { sentToday: number; sentLastMinute: number; updatedAt: string | null }>();
      for (const row of (pacingData ?? []) as any[]) {
        pacingMap.set(row.identity_id, {
          sentToday: row.sent_today,
          sentLastMinute: row.sent_last_minute,
          updatedAt: row.updated_at,
        });
      }

      const summaries: IdentitySummary[] = (identityData as any[]).map((row) => ({
        id: row.id,
        email: row.email,
        provider: row.provider,
        capacity: computeCapacity({
          dailyLimit: row.daily_limit,
          warmupEnabled: row.warmup_enabled,
          warmupStage: row.warmup_stage,
          warmupMaxStage: row.warmup_max_stage,
        }),
        sentToday: pacingMap.get(row.id)?.sentToday ?? 0,
        sentLastMinute: pacingMap.get(row.id)?.sentLastMinute ?? 0,
        updatedAt: pacingMap.get(row.id)?.updatedAt ?? null,
      }));

      setIdentities(summaries);
    }

    if (accountId && leadIds.length) {
      const leadEmails = Array.from(
        new Set(
          (leadsData ?? [])
            .map((lead: any) => lead.email as string | undefined)
            .filter((email): email is string => Boolean(email)),
        ),
      );
      if (leadEmails.length) {
        const { data: suppressionData, error: supErr } = await supabase
          .from("account_suppressions")
          .select("email,expires_at,reason")
          .eq("account_id", accountId)
          .in("email", leadEmails);

        if (!supErr && suppressionData) {
          const supMap: Record<string, SuppressionInfo> = {};
          for (const sup of suppressionData as any[]) {
            supMap[sup.email] = { expiresAt: sup.expires_at, reason: sup.reason };
          }
          setSuppressions(supMap);
        }
      }
    } else {
      setSuppressions({});
    }

    setLoading(false);
  }, [campaignId, supabase]);

  useEffect(() => {
    const timer = setInterval(() => {
      void refresh();
    }, REFRESH_MS);
    void refresh();
    return () => clearInterval(timer);
  }, [refresh]);

  const activeQueue = useMemo(() => queue, [queue]);

  async function cancelJob(id: number) {
    if (!canSend) return;
    await supabase
      .from("send_queue")
      .update({ status: "canceled", finished_at: new Date().toISOString(), picked_at: null })
      .eq("id", id);
    void refresh();
  }

  async function rescheduleSoftFailures() {
    if (!canSend) return;
    await supabase
      .from("send_queue")
      .update({ scheduled_at: new Date().toISOString(), picked_at: null })
      .eq("campaign_id", campaignId)
      .eq("status", "queued")
      .gt("attempt", 0);
    void refresh();
  }

  function suppressionBadge(email: string | undefined) {
    if (!email) return null;
    const sup = suppressions[email];
    if (!sup || sup.reason !== "ooopause") return null;
    if (sup.expiresAt && new Date(sup.expiresAt) < new Date()) return null;
    return (
      <span className="ml-2 inline-flex items-center rounded-md border border-amber-400 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
        OOO until {sup.expiresAt ? new Date(sup.expiresAt).toLocaleDateString() : "manual clear"}
      </span>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Queue Monitor</h1>
          <p className="text-sm opacity-60">Auto-refreshing every {REFRESH_MS / 1000}s.</p>
        </div>
        {canSend && (
          <button
            onClick={rescheduleSoftFailures}
            className="rounded-xl border px-3 py-2 text-sm hover:bg-zinc-50 disabled:opacity-60"
            disabled={loading}
          >
            Reschedule all soft failures
          </button>
        )}
      </header>

      <section className="grid gap-3 md:grid-cols-3">
        {identities.map((identity) => (
          <div key={identity.id} className="rounded-xl border p-3 text-sm">
            <div className="font-medium">{identity.email}</div>
            <div className="opacity-60">{identity.provider}</div>
            <div className="mt-3 space-y-1">
              <div>
                <span className="opacity-60">Today:</span> {identity.sentToday} / {identity.capacity}
              </div>
              <div>
                <span className="opacity-60">Last minute:</span> {identity.sentLastMinute}
              </div>
              {identity.updatedAt && (
                <div className="text-xs opacity-60">
                  Updated {formatDate(identity.updatedAt)}
              </div>
              )}
            </div>
          </div>
        ))}
        {!identities.length && (
          <div className="rounded-xl border p-3 text-sm opacity-60">
            No pacing data available yet.
            </div>
          )}
      </section>

      <section className="rounded-2xl border">
        <div className="border-b px-4 py-3 text-sm">
          {loading ? "Refreshing…" : `Showing ${activeQueue.length} queued messages`}
          {error && <span className="ml-2 text-red-600">{error}</span>}
            </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left">
              <tr>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Lead</th>
                <th className="px-4 py-2">Identity</th>
                <th className="px-4 py-2">Scheduled</th>
                <th className="px-4 py-2">Attempt</th>
                <th className="px-4 py-2">Last error</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {activeQueue.map((row) => {
                const lead = leads[row.lead_id];
                const identity = identities.find((i) => i.id === row.identity_id);
                const email = lead?.email;
                return (
                  <tr key={row.id} className="border-t">
                    <td className="px-4 py-2 capitalize">{row.status}</td>
                    <td className="px-4 py-2">
                      <div className="flex flex-col">
                        <span>{formatLead(lead)}</span>
                        {suppressionBadge(email)}
                      </div>
                  </td>
                    <td className="px-4 py-2">{identity ? `${identity.email} (${identity.provider})` : "–"}</td>
                    <td className="px-4 py-2">{formatDate(row.scheduled_at)}</td>
                    <td className="px-4 py-2">
                      {row.attempt}/{row.max_attempts}
                  </td>
                    <td className="px-4 py-2">
                      <span className="line-clamp-2 break-all text-xs opacity-80">
                        {row.last_error ?? "—"}
                      </span>
                  </td>
                    <td className="px-4 py-2 text-right">
                      {canSend ? (
                    <button
                          onClick={() => cancelJob(row.id)}
                          className="rounded-lg border px-3 py-1 text-xs hover:bg-zinc-50"
                    >
                          Cancel
                    </button>
                      ) : (
                        <span className="text-xs opacity-60">View only</span>
                      )}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!activeQueue.length && (
          <div className="px-4 py-6 text-center text-sm opacity-60">Queue is empty.</div>
        )}
      </section>
    </div>
  );
}
