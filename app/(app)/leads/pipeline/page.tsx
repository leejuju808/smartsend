"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import clsx from "clsx";
import { LeadDetailDrawer, LeadForDrawer } from "./LeadDetailDrawer";

type LeadRow = {
  contact_id: string;
  account_id: string;
  display_name: string | null;
  email: string | null;
  company: string | null;
  latest_intent: string | null;
  latest_intent_confidence: number | null;
  last_intent_at: string | null;
  pipeline_stage: string | null;
  effective_stage: string | null;
  smartsend_homeowner?: boolean | null;
};

const STAGES = ["HOT", "WARM", "FOLLOW_UP", "NOT_INTERESTED"] as const;

type Stage = (typeof STAGES)[number];

function stageLabel(stage: Stage) {
  switch (stage) {
    case "HOT":
      return "Hot";
    case "WARM":
      return "Warm";
    case "FOLLOW_UP":
      return "Follow-Up";
    case "NOT_INTERESTED":
      return "Not Interested";
  }
}

export default function LeadPipelinePage() {
  const supabase = createClientComponentClient();
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<LeadForDrawer | null>(null);

  const openDrawerForLead = (lead: LeadRow) => {
    setSelectedLead({
      contact_id: lead.contact_id,
      display_name: lead.display_name,
      email: lead.email,
      company: lead.company,
      latest_intent: lead.latest_intent,
      latest_intent_confidence: lead.latest_intent_confidence,
      last_intent_at: lead.last_intent_at,
      effective_stage: lead.effective_stage,
      smartsend_homeowner: !!lead.smartsend_homeowner,
    });
    setDrawerOpen(true);
  };

  const fetchLeads = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("lead_pipeline_view")
      .select("*")
      .order("last_intent_at", { ascending: false, nullsFirst: false });

    setLoading(false);

    if (error) {
      console.error("[LeadPipeline] load error", error);
      return;
    }

    setLeads((data ?? []) as LeadRow[]);
  };

  useEffect(() => {
    fetchLeads();
  }, []);

  const handleChangeStage = async (contactId: string, stage: Stage | "CLEAR") => {
    try {
      setUpdatingId(contactId);
      const res = await fetch("/api/leads/update-stage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId,
          pipelineStage: stage,
        }),
      });

      if (!res.ok) {
        console.error("[LeadPipeline] update-stage failed");
        return;
      }

      // Refresh list
      await fetchLeads();
    } finally {
      setUpdatingId(null);
    }
  };

  const grouped: Record<Stage, LeadRow[]> = {
    HOT: [],
    WARM: [],
    FOLLOW_UP: [],
    NOT_INTERESTED: [],
  };

  for (const lead of leads) {
    const stage = (lead.effective_stage || "FOLLOW_UP").toUpperCase() as Stage;
    if (STAGES.includes(stage)) {
      grouped[stage].push(lead);
    } else {
      grouped.FOLLOW_UP.push(lead);
    }
  }

  return (
    <main className="p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Lead Pipeline
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            See every contact by priority: Hot, Warm, Follow-Up, Not Interested.
          </p>
        </div>
        <button
          onClick={fetchLeads}
          className="rounded-2xl border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800"
        >
          Refresh
        </button>
      </header>

      {loading ? (
        <p className="text-sm text-zinc-400">Loading pipeline…</p>
      ) : (
        <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {STAGES.map((stage) => {
            const items = grouped[stage];

            return (
              <div
                key={stage}
                className={clsx(
                  "rounded-2xl border p-4 flex flex-col gap-3",
                  stage === "HOT" && "border-emerald-500/60",
                  stage === "WARM" && "border-amber-400/60",
                  stage === "FOLLOW_UP" && "border-sky-400/60",
                  stage === "NOT_INTERESTED" && "border-zinc-700"
                )}
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold">
                    {stageLabel(stage)}{" "}
                    <span className="text-xs text-zinc-500">
                      ({items.length})
                    </span>
                  </h2>
                </div>

                <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
                  {items.length === 0 ? (
                    <p className="text-xs text-zinc-500">
                      No leads in this stage yet.
                    </p>
                  ) : (
                    items.map((lead) => (
                      <div
                        key={lead.contact_id}
                        className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3 space-y-1"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-medium">
                              {lead.display_name || lead.email || "Unknown"}
                            </p>
                            {lead.smartsend_homeowner ? (
                              <p className="mt-1">
                                <span className="inline-flex items-center rounded-full border border-zinc-700 bg-zinc-900/60 px-2 py-0.5 text-[10px] text-zinc-200">
                                  SmartSend Homeowner
                                </span>
                              </p>
                            ) : null}
                            {lead.company && (
                              <p className="text-[11px] text-zinc-500">
                                {lead.company}
                              </p>
                            )}
                            {lead.email && (
                              <p className="text-[11px] text-zinc-500">
                                {lead.email}
                              </p>
                            )}
                          </div>
                          <button
                            onClick={() => openDrawerForLead(lead)}
                            className="text-[10px] rounded-full border border-zinc-700 px-2 py-0.5 text-zinc-300 hover:border-zinc-400"
                          >
                            View
                          </button>
                        </div>

                        {lead.latest_intent && (
                          <p className="text-[11px] text-zinc-500 mt-1">
                            AI Intent:{" "}
                            <span className="font-semibold">
                              {lead.latest_intent}
                            </span>{" "}
                            {lead.latest_intent_confidence != null && (
                              <span>
                                ({Math.round(
                                  Number(lead.latest_intent_confidence) * 100
                                )}
                                %)
                              </span>
                            )}
                          </p>
                        )}

                        <div className="flex flex-wrap gap-1 mt-2">
                          {STAGES.map((target) => (
                            <button
                              key={target}
                              disabled={updatingId === lead.contact_id}
                              onClick={() =>
                                handleChangeStage(lead.contact_id, target)
                              }
                              className={clsx(
                                "rounded-full px-2 py-0.5 text-[10px] border",
                                lead.pipeline_stage === target
                                  ? "border-zinc-50 text-zinc-50"
                                  : "border-zinc-700 text-zinc-400 hover:border-zinc-400"
                              )}
                            >
                              {stageLabel(target)}
                            </button>
                          ))}

                          <button
                            disabled={updatingId === lead.contact_id}
                            onClick={() =>
                              handleChangeStage(lead.contact_id, "CLEAR")
                            }
                            className="rounded-full px-2 py-0.5 text-[10px] border border-zinc-800 text-zinc-500 hover:border-zinc-500"
                          >
                            Clear Manual
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </section>
      )}

      <LeadDetailDrawer
        lead={selectedLead}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </main>
  );
}

