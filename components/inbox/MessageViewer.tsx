"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Lead = { id: string; email: string; first_name?: string|null; last_name?: string|null; company?: string|null };
type Inbound = { id: string; provider: string; from_email: string; to_email: string; subject: string; body: string; created_at: string; thread_id?: string|null };

export function MessageViewer({
  lead,
  inbound,
  starred,
  resolved,
  onTriageChange,
}: {
  lead: Lead | null;
  inbound: Inbound[];
  starred: boolean;
  resolved: boolean;
  onTriageChange: (patch: {starred?: boolean; resolved?: boolean; notes?: string}) => Promise<void>;
}) {
  const [notes, setNotes] = React.useState("");

  if (!lead) {
    return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Pick a thread</div>;
  }

  const name = (lead.first_name || lead.last_name) ? `${lead.first_name ?? ""} ${lead.last_name ?? ""}`.trim() : lead.email;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b p-3">
        <div>
          <div className="font-medium">{name}</div>
          <div className="text-xs text-muted-foreground">{lead.email} {lead.company ? `• ${lead.company}` : ""}</div>
        </div>
        <div className="flex gap-2">
          <Button variant={starred ? "default" : "outline"} onClick={()=>onTriageChange({ starred: !starred })}>
            {starred ? "★ Starred" : "☆ Star"}
          </Button>
          <Button variant={resolved ? "default" : "outline"} onClick={()=>onTriageChange({ resolved: !resolved })}>
            {resolved ? "✓ Resolved" : "Mark Resolved"}
          </Button>
          <a href={`mailto:${lead.email}`} className="inline-flex">
            <Button variant="secondary">Reply in Email</Button>
          </a>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {inbound.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">No inbound messages yet for this lead.</div>
        ) : (
          <div className="space-y-4 p-4">
            {inbound.map(m => (
              <div key={m.id} className="rounded-xl border p-3">
                <div className="text-xs text-muted-foreground flex items-center justify-between">
                  <span>{m.provider} • {new Date(m.created_at).toLocaleString()}</span>
                  <span>to {m.to_email}</span>
                </div>
                <div className="mt-1 font-medium">{m.subject || "(no subject)"}</div>
                <div className="mt-2 whitespace-pre-wrap text-sm">{m.body || "(empty body)"}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t p-3">
        <div className="text-xs mb-1 text-muted-foreground">Internal notes</div>
        <div className="flex gap-2">
          <Textarea value={notes} onChange={(e)=>setNotes(e.target.value)} placeholder="Next step, call outcome, etc."/>
          <Button onClick={()=>onTriageChange({ notes })}>Save</Button>
        </div>
      </div>
    </div>
  );
}


