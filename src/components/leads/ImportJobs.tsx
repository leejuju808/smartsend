"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/badge";

type Job = {
  id: string; created_at: string; filename: string | null;
  status: "staged"|"validating"|"ready"|"applying"|"done"|"error";
  total_rows: number; valid_rows: number; invalid_rows: number; deduped_rows: number; error?: string|null;
};

export function ImportJobs() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [page, setPage] = useState(1);
  const size = 10;

  async function load(p = page) {
    const r = await fetch(`/api/imports/jobs?page=${p}&size=${size}`);
    const j = await r.json();
    if (!r.ok) return alert(j.error || "Failed to load jobs");
    setJobs(j.jobs);
    setPage(p);
  }

  useEffect(() => { load(1); }, []);

  async function del(id: string) {
    if (!confirm("Delete this import job?")) return;
    const r = await fetch(`/api/imports/${id}`, { method: "DELETE" });
    const j = await r.json();
    if (!r.ok) return alert(j.error || "Delete failed");
    load(1);
  }

  return (
    <Card className="p-4 space-y-3">
      <div className="text-sm font-medium">Recent Imports</div>
      <div className="space-y-2">
        {jobs.map(job => (
          <div key={job.id} className="flex items-center justify-between border rounded-md px-3 py-2">
            <div className="flex items-center gap-3">
              <Badge variant={job.status === "done" ? "default" :
                              job.status === "ready" ? "secondary" :
                              job.status === "error" ? "destructive" : "outline"}>
                {job.status}
              </Badge>
              <div className="text-sm">
                <div className="font-medium">{job.filename || "upload.csv"}</div>
                <div className="text-xs opacity-70">
                  {new Date(job.created_at).toLocaleString()} · total {job.total_rows} · valid {job.valid_rows} · invalid {job.invalid_rows} · deduped {job.deduped_rows}
                  {job.error ? ` · error: ${job.error}` : ""}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <a className="text-xs underline" href={`/imports/${job.id}`} >Preview</a>
              <Button variant="ghost" size="sm" onClick={()=>del(job.id)}>Delete</Button>
            </div>
          </div>
        ))}
        {jobs.length === 0 && <div className="text-xs opacity-70">No imports yet.</div>}
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={()=>load(Math.max(1, page-1))}>Prev</Button>
        <div className="text-xs">Page {page}</div>
        <Button variant="outline" size="sm" onClick={()=>load(page+1)}>Next</Button>
      </div>
    </Card>
  );
}

