"use client";

import { useEffect, useState } from "react";
import { LeadOutcomePanel } from "@/app/(dashboard)/leads/LeadOutcomePanel";
import Link from "next/link";
import { X, Mail, Phone, MapPin, Calendar, CheckCircle2 } from "lucide-react";

function computeJobSource(raw: string | null | undefined): {
  primary: string;
  secondary: string | null;
} {
  const source = (raw || "").trim();
  const s = source.toLowerCase();

  const primary = "SmartSend Outreach";
  if (!source) return { primary, secondary: null };

  const isSmartSend =
    s.includes("smartsend") ||
    s.includes("cold email") ||
    s.includes("email outreach") ||
    s.includes("outreach") ||
    s.includes("campaign") ||
    s.includes("sequence") ||
    s.includes("follow-up") ||
    s.includes("autopilot");

  if (isSmartSend) return { primary, secondary: null };
  return { primary, secondary: source };
}

type TimelineEvent = {
  type: string;
  summary: string;
  created_at: string;
  direction?: string;
  is_hot?: boolean;
};

type Task = {
  id: string;
  title: string;
  due_at: string | null;
  status: string;
};

type LeadProfileData = {
  lead: any;
  events: TimelineEvent[];
  tasks: Task[];
  last_inbound: string | null;
  last_outbound: string | null;
};

export function LeadProfileDrawerUnified({
  leadId,
  onClose,
}: {
  leadId: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<LeadProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!leadId) return;

    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/leads/${leadId}/profile`, {
          cache: "no-store",
        });
        if (!res.ok) {
          throw new Error("Failed to load lead profile");
        }
        const json = await res.json();
        setData(json);
      } catch (err) {
        console.error("Failed to load lead profile:", err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [leadId]);

  if (loading || !data) {
    return (
      <div className="fixed right-0 top-0 z-50 h-full w-96 border-l border-neutral-800 bg-neutral-950/95 p-4 text-neutral-50">
        <div className="flex h-full items-center justify-center">
          <p className="text-sm text-neutral-400">Loading…</p>
        </div>
      </div>
    );
  }

  const lead = data.lead;
  const { primary: jobSourcePrimary, secondary: jobSourceSecondary } =
    computeJobSource(lead.lead_source);

  const name =
    lead.name ||
    [lead.first_name, lead.last_name].filter(Boolean).join(" ") ||
    lead.email;

  const outcomeBadge = lead.outcome === "won" ? "Won" : lead.outcome === "lost" ? "Lost" : "Open";
  const outcomeColor =
    lead.outcome === "won"
      ? "bg-emerald-500 text-neutral-900"
      : lead.outcome === "lost"
      ? "bg-red-500 text-neutral-50"
      : "bg-neutral-100 text-neutral-900";

  // Find inbox thread for this lead
  const inboxThreadUrl = `/inbox?lead_id=${leadId}`;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/60"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 z-50 flex h-full w-96 flex-col border-l border-neutral-800 bg-neutral-950/95">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-800 p-4">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-neutral-50 truncate">
              {name}
            </h2>
            <p className="text-xs text-neutral-400 truncate">{lead.email}</p>
          </div>

          <button
            onClick={onClose}
            className="ml-2 rounded-lg bg-neutral-900 px-3 py-1 text-xs text-neutral-300 hover:text-neutral-50 transition-colors"
          >
            Close
          </button>
        </div>

        {/* Outcome Badge & Quick Actions */}
        <div className="border-b border-neutral-800 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[0.65rem] font-semibold ${outcomeColor}`}>
              {outcomeBadge}
            </span>
            {/* Block 8850: Lead Score Badge */}
            {typeof lead.score === 'number' && (
              <div className="flex items-center gap-1">
                <div className="text-neutral-400 text-[0.65rem] uppercase">
                  Lead Score
                </div>
                <div className={`rounded-xl px-2 py-1 text-[0.75rem] font-semibold ${
                  lead.score >= 80 ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                  lead.score >= 40 ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                  'bg-neutral-800 text-neutral-100 border border-neutral-700'
                }`}>
                  {lead.score}
                </div>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Link
              href={inboxThreadUrl}
              className="flex-1 rounded-lg bg-neutral-900 px-3 py-1.5 text-xs text-neutral-300 hover:text-neutral-50 hover:bg-neutral-800 transition-colors text-center"
            >
              Open Inbox Thread
            </Link>
          </div>
        </div>

        {/* Scroll Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Contact Information */}
          <div className="space-y-2 text-xs">
            <h3 className="font-semibold text-neutral-200">Contact Info</h3>
            <div className="space-y-1.5">
              {lead.email && (
                <div className="flex items-center gap-2 text-neutral-400">
                  <Mail className="h-3.5 w-3.5 text-neutral-500" />
                  <span>{lead.email}</span>
                </div>
              )}
              {lead.phone && (
                <div className="flex items-center gap-2 text-neutral-400">
                  <Phone className="h-3.5 w-3.5 text-neutral-500" />
                  <span>{lead.phone}</span>
                </div>
              )}
              {(lead.address || lead.city || lead.state || lead.zip) && (
                <div className="flex items-start gap-2 text-neutral-400">
                  <MapPin className="h-3.5 w-3.5 text-neutral-500 mt-0.5" />
                  <span>
                    {[lead.address, lead.city, lead.state, lead.zip]
                      .filter(Boolean)
                      .join(" ")}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Lead Data */}
          <div className="space-y-2 text-xs">
            <h3 className="font-semibold text-neutral-200">Lead Data</h3>
            <div className="space-y-1.5 text-neutral-400">
              <div>
                <span className="text-neutral-500">Job Source: </span>
                <span className="text-neutral-300">{jobSourcePrimary}</span>
                {jobSourceSecondary && (
                  <span className="text-neutral-500"> · {jobSourceSecondary}</span>
                )}
              </div>
              {lead.campaigns?.name && (
                <div>
                  <span className="text-neutral-500">City outreach: </span>
                  <span className="text-neutral-300">{lead.campaigns.name}</span>
                </div>
              )}
              {lead.status && (
                <div>
                  <span className="text-neutral-500">Status: </span>
                  <span className="text-neutral-300 capitalize">{lead.status}</span>
                </div>
              )}
              {lead.created_at && (
                <div className="flex items-center gap-2">
                  <Calendar className="h-3.5 w-3.5 text-neutral-500" />
                  <span>
                    Created: {new Date(lead.created_at).toLocaleDateString()}
                  </span>
                </div>
              )}
              {data.last_outbound && (
                <div>
                  <span className="text-neutral-500">Last contacted: </span>
                  <span className="text-neutral-300">
                    {new Date(data.last_outbound).toLocaleDateString()}
                  </span>
                </div>
              )}
              {data.last_inbound && (
                <div>
                  <span className="text-neutral-500">Last response: </span>
                  <span className="text-neutral-300">
                    {new Date(data.last_inbound).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Outcome Panel */}
          <LeadOutcomePanel
            leadId={lead.id}
            initialOutcome={lead.outcome || "open"}
            initialWonValue={lead.won_value}
            initialNotes={lead.notes}
          />

          {/* Tasks Preview */}
          {data.tasks.length > 0 && (
            <div className="space-y-2 text-xs">
              <h3 className="font-semibold text-neutral-200">Open Tasks</h3>
              <div className="space-y-1.5">
                {data.tasks.map((t) => (
                  <div
                    key={t.id}
                    className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 flex items-start justify-between gap-2"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-neutral-200">{t.title}</p>
                      {t.due_at && (
                        <p className="text-neutral-500 text-[0.65rem] mt-0.5">
                          Due: {new Date(t.due_at).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={async () => {
                        // Mark task as done
                        try {
                          const res = await fetch(`/api/tasks/${t.id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ status: "done" }),
                          });
                          if (res.ok) {
                            // Refresh data
                            const refreshRes = await fetch(`/api/leads/${leadId}/profile`, {
                              cache: "no-store",
                            });
                            if (refreshRes.ok) {
                              const refreshData = await refreshRes.json();
                              setData(refreshData);
                            }
                          }
                        } catch (err) {
                          console.error("Failed to mark task as done:", err);
                        }
                      }}
                      className="text-neutral-500 hover:text-neutral-300 transition-colors"
                      title="Mark done"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Timeline Preview */}
          <div className="space-y-2 text-xs">
            <h3 className="font-semibold text-neutral-200">Recent Activity</h3>
            {data.events.length === 0 && (
              <p className="text-neutral-500 text-[0.7rem]">No recent activity.</p>
            )}
            <div className="space-y-1.5">
              {data.events.map((ev, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-neutral-300"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-[0.7rem] font-medium text-neutral-200 capitalize">
                        {ev.type.replace("_", " ")}
                      </p>
                      <p className="text-[0.65rem] text-neutral-400 mt-0.5 line-clamp-2">
                        {ev.summary}
                      </p>
                    </div>
                    {ev.is_hot && (
                      <span className="text-[0.6rem] text-emerald-400 font-semibold">
                        🔥
                      </span>
                    )}
                  </div>
                  <p className="text-[0.65rem] text-neutral-500 mt-1.5">
                    {new Date(ev.created_at).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
            <Link
              href={`/leads/${lead.id}/timeline`}
              className="inline-block text-[0.7rem] text-emerald-400 hover:text-emerald-300 hover:underline transition-colors"
            >
              View Full Timeline →
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}

