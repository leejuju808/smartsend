"use client";

import { useLeadActivity } from "@/lib/hooks/useLeadActivity";
import { Badge } from "@/components/ui/badge";

export function LeadActivityPanel({ leadId }: { leadId: string }) {
  const { data, loading, reload } = useLeadActivity(leadId);

  if (loading || !data) {
    return (
      <div className="p-4 text-xs text-muted-foreground">
        Loading activity…
      </div>
    );
  }

  const { lead, sends, events, replies, bounces, unsubs, notes } = data;

  if (!lead) {
    return (
      <div className="p-4 text-xs text-muted-foreground">
        Lead not found
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 w-[320px] border-l bg-white h-full overflow-y-auto">
      <h2 className="text-lg font-semibold">
        {lead.first_name || ""} {lead.last_name || ""}
        {!lead.first_name && !lead.last_name && "Lead"}
      </h2>
      <div className="text-xs text-muted-foreground">{lead.email}</div>

      {(lead.unsubscribed || lead.status === "unsubscribed") && (
        <Badge variant="destructive" className="text-[10px]">Unsubscribed</Badge>
      )}

      {(lead.bounced || lead.status === "bounced") && (
        <Badge variant="destructive" className="text-[10px]">Bounced</Badge>
      )}

      <div className="space-y-3 text-xs">

        <div>
          <h3 className="font-medium mb-1">Sends</h3>
          <ul className="space-y-1">
            {sends && sends.length > 0 ? (
              sends.map((s: any) => (
                <li key={s.id}>
                  Step {s.step_number ?? s.step_no ?? "N/A"} — {s.status}  
                  <div className="text-muted-foreground">
                    {new Date(s.created_at).toLocaleString()}
                  </div>
                </li>
              ))
            ) : (
              <li className="text-muted-foreground">No sends yet</li>
            )}
          </ul>
        </div>

        <div>
          <h3 className="font-medium mb-1">Opens & Clicks</h3>
          <ul className="space-y-1">
            {events && events.length > 0 ? (
              events.map((e: any) => (
                <li key={e.id}>
                  {e.event_type?.toUpperCase() ?? "EVENT"}  
                  <div className="text-muted-foreground">
                    {new Date(e.created_at).toLocaleString()}
                  </div>
                </li>
              ))
            ) : (
              <li className="text-muted-foreground">No events yet</li>
            )}
          </ul>
        </div>

        <div>
          <h3 className="font-medium mb-1">Replies</h3>
          <ul className="space-y-1">
            {replies && replies.length > 0 ? (
              replies.map((r: any) => (
                <li key={r.id}>
                  Reply received  
                  <div className="text-muted-foreground">
                    {new Date(r.created_at).toLocaleString()}
                  </div>
                  {r.snippet && (
                    <div className="mt-1">{r.snippet}</div>
                  )}
                </li>
              ))
            ) : (
              <li className="text-muted-foreground">No replies yet</li>
            )}
          </ul>
        </div>

        <div>
          <h3 className="font-medium mb-1">Bounces</h3>
          <ul className="space-y-1">
            {bounces && bounces.length > 0 ? (
              bounces.map((b: any) => (
                <li key={b.id}>
                  Bounced — {b.reason ?? "Unknown"}
                  <div className="text-muted-foreground">
                    {new Date(b.created_at).toLocaleString()}
                  </div>
                </li>
              ))
            ) : (
              <li className="text-muted-foreground">No bounces</li>
            )}
          </ul>
        </div>

        <div>
          <h3 className="font-medium mb-1">Unsubscribes</h3>
          <ul className="space-y-1">
            {unsubs && unsubs.length > 0 ? (
              unsubs.map((u: any) => (
                <li key={u.id}>
                  Unsubscribed
                  <div className="text-muted-foreground">
                    {new Date(u.created_at).toLocaleString()}
                  </div>
                </li>
              ))
            ) : (
              <li className="text-muted-foreground">No unsubscribes</li>
            )}
          </ul>
        </div>

        <div>
          <h3 className="font-medium mb-1">Notes</h3>
          <ul className="space-y-1">
            {notes && notes.length > 0 ? (
              notes.map((n: any) => (
                <li key={n.id}>
                  {n.body}
                  <div className="text-muted-foreground">
                    {new Date(n.created_at).toLocaleString()}
                  </div>
                </li>
              ))
            ) : (
              <li className="text-muted-foreground">No notes yet</li>
            )}
          </ul>

          <textarea
            id="newnote"
            placeholder="Add a note…"
            className="w-full border p-2 text-xs rounded mt-2"
          />

          <button
            onClick={async () => {
              const body = (
                document.getElementById("newnote") as HTMLTextAreaElement
              ).value;
              if (!body.trim()) return;
              
              await fetch(`/api/leads/${leadId}/notes`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ note: body }),
              });
              (
                document.getElementById("newnote") as HTMLTextAreaElement
              ).value = "";
              reload();
            }}
            className="mt-2 px-3 py-1 bg-black text-white text-xs rounded"
          >
            Add Note
          </button>
        </div>
      </div>
    </div>
  );
}

