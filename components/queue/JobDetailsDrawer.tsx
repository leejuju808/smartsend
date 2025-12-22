"use client";

import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Attempt = {
  id: string;
  attempt_no: number;
  status: string;
  provider?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  meta?: any;
  created_at: string;
};

export function JobDetailsDrawer({
  open, onOpenChange, queueId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  queueId: string | null;
}) {
  const [loading, setLoading] = React.useState(false);
  const [job, setJob] = React.useState<any>(null);
  const [attempts, setAttempts] = React.useState<Attempt[]>([]);
  const [events, setEvents] = React.useState<any[]>([]);

  React.useEffect(() => {
    const load = async () => {
      if (!open || !queueId) return;
      setLoading(true);
      const res = await fetch(`/api/queue/job?id=${queueId}`, { cache: "no-store" });
      const j = await res.json();
      setLoading(false);
      if (!res.ok) { setJob(null); setAttempts([]); setEvents([]); return; }
      setJob(j.job);
      setAttempts(j.attempts || []);
      setEvents(j.events || []);
    };
    load();
  }, [open, queueId]);

  const metaPretty = (m: any) => {
    try { return JSON.stringify(m ?? {}, null, 2); } catch { return "{}"; }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Job Details</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="space-y-2">
            <div className="h-5 w-40 animate-pulse rounded bg-muted" />
            <div className="h-28 w-full animate-pulse rounded bg-muted" />
          </div>
        ) : !job ? (
          <div className="text-sm text-muted-foreground">No job loaded.</div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-2xl border p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{job.lead_email ?? job.email ?? "Unknown recipient"}</div>
                  <div className="text-xs text-muted-foreground">
                    {job.company ?? "—"} • Queue ID: <span className="font-mono">{job.id}</span>
                  </div>
                </div>
                <Badge>{job.status}</Badge>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <div>Campaign: <span className="font-medium">{job.campaign_id}</span></div>
                <div>Lead: <span className="font-medium">{job.lead_id}</span></div>
                <div>Attempts: <span className="font-medium">{job.attempt_count ?? 0}/{job.max_attempts ?? 3}</span></div>
                <div>Updated: <span className="font-medium">{job.updated_at ? new Date(job.updated_at).toLocaleString() : "—"}</span></div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Attempts</div>
              {attempts.length === 0 ? (
                <div className="text-sm text-muted-foreground">No attempts logged yet.</div>
              ) : (
                <div className="space-y-2">
                  {attempts.map(a => (
                    <div key={a.id} className="rounded-xl border p-3">
                      <div className="flex items-center justify-between">
                        <div className="text-sm">
                          <span className="font-medium">Attempt #{a.attempt_no}</span> — {a.status}
                        </div>
                        <div className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleString()}</div>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Provider: {a.provider ?? "—"} {a.error_code ? `• Error: ${a.error_code}` : ""}
                      </div>
                      {a.error_message && (
                        <div className="mt-1 whitespace-pre-wrap text-sm text-red-600">{a.error_message}</div>
                      )}
                      {a.meta && (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-sm">Metadata</summary>
                          <pre className="mt-1 max-h-56 overflow-auto rounded bg-muted p-2 text-xs">{metaPretty(a.meta)}</pre>
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">Related Events</div>
              {events.length === 0 ? (
                <div className="text-sm text-muted-foreground">No related events.</div>
              ) : (
                <div className="space-y-2">
                  {events.map((e: any) => (
                    <div key={e.id} className="rounded-xl border p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <div className="font-medium">{e.event}</div>
                        <div className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString()}</div>
                      </div>
                      {e.meta && (
                        <pre className="mt-1 max-h-40 overflow-auto rounded bg-muted p-2 text-xs">{metaPretty(e.meta)}</pre>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={()=>{ if (job?.id) navigator.clipboard.writeText(job.id); }}>Copy Queue ID</Button>
              <a href={`mailto:${job.lead_email ?? job.email ?? ""}`} className="inline-flex">
                <Button>Reply in Email</Button>
              </a>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}


