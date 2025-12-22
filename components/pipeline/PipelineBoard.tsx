"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { LeadCard } from "./LeadCard";
import { LeadDetailDrawer } from "./LeadDetailDrawer";
import clsx from "clsx";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const STAGES = [
  { id: "new_lead", name: "New Lead", color: "border-gray-500" },
  { id: "inspection", name: "Inspection Scheduled", color: "border-blue-500" },
  { id: "estimate_sent", name: "Estimate Sent", color: "border-amber-500" },
  { id: "job_won", name: "Job Won", color: "border-emerald-500" },
] as const;

type Contact = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  company: string | null;
  tags: string[] | null;
  pipeline_stage: string;
  inspection_at: string | null;
  inspection_notes: string | null;
  estimate_amount: number | null;
  estimate_sent_at: string | null;
  job_value: number | null;
  job_won_at: string | null;
  created_at: string;
  updated_at: string;
};

export function PipelineBoard() {
  const { data, error, isLoading, mutate } = useSWR(
    "/api/pipeline/contacts",
    fetcher,
    {
      refreshInterval: 30000, // Refresh every 30 seconds
    }
  );

  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const contacts: Contact[] = data?.contacts || [];

  // Group contacts by stage
  const contactsByStage = contacts.reduce(
    (acc, contact) => {
      const stage = contact.pipeline_stage || "new_lead";
      if (!acc[stage]) {
        acc[stage] = [];
      }
      acc[stage].push(contact);
      return acc;
    },
    {} as Record<string, Contact[]>
  );

  const handleCardClick = (contact: Contact) => {
    setSelectedContact(contact);
    setDrawerOpen(true);
  };

  const handleStageUpdate = () => {
    mutate(); // Refresh data after update
  };

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-8 text-center">
        <div className="text-sm text-zinc-400">Loading pipeline...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-8 text-center">
        <div className="text-sm text-red-400">Failed to load pipeline</div>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {STAGES.map((stage) => {
          const stageContacts = contactsByStage[stage.id] || [];

          return (
            <div
              key={stage.id}
              className={clsx(
                "rounded-2xl border p-4 flex flex-col gap-3",
                stage.color
              )}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">
                  {stage.name}{" "}
                  <span className="text-xs text-zinc-500">
                    ({stageContacts.length})
                  </span>
                </h2>
              </div>

              <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
                {stageContacts.length === 0 ? (
                  <p className="text-xs text-zinc-500">
                    No leads in this stage yet.
                  </p>
                ) : (
                  stageContacts.map((contact) => (
                    <LeadCard
                      key={contact.id}
                      contact={contact}
                      onClick={() => handleCardClick(contact)}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {selectedContact && (
        <LeadDetailDrawer
          contact={selectedContact}
          open={drawerOpen}
          onClose={() => {
            setDrawerOpen(false);
            setSelectedContact(null);
          }}
          onUpdate={handleStageUpdate}
        />
      )}
    </>
  );
}




























































