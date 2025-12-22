"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Loader2, Check, X, Bot } from "lucide-react";

type ReviewJob = {
  id: string;
  lead_id: string;
  reply_id: string | null;
  template_key: string;
  subject: string;
  body: string;
  edited_subject: string | null;
  edited_body: string | null;
  scheduled_at: string;
  review_status: string;
  status: string;
  created_at: string;
  leads?: {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    company: string | null;
  } | null;
};

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ReviewQueue({ jobs }: { jobs: ReviewJob[] }) {
  const [localJobs, setLocalJobs] = useState(
    jobs.map((j) => ({
      ...j,
      localSubject: j.edited_subject || j.subject,
      localBody: j.edited_body || j.body,
      saving: false,
    })),
  );

  const handleAction = async (
    jobId: string,
    action: "approve" | "skip",
  ) => {
    setLocalJobs((prev) =>
      prev.map((j) =>
        j.id === jobId ? { ...j, saving: true } : j,
      ),
    );

    const job = localJobs.find((j) => j.id === jobId);
    if (!job) return;

    try {
      const res = await fetch("/api/sdr-autopilot-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_id: jobId,
          action,
          subject: action === "approve" ? job.localSubject : undefined,
          body: action === "approve" ? job.localBody : undefined,
        }),
      });

      if (!res.ok) throw new Error("Failed");

      setLocalJobs((prev) =>
        prev.filter((j) => j.id !== jobId),
      );
    } catch (err) {
      console.error(err);
      alert("Failed to update job");
      setLocalJobs((prev) =>
        prev.map((j) =>
          j.id === jobId ? { ...j, saving: false } : j,
        ),
      );
    }
  };

  const updateJobField = (
    jobId: string,
    key: "localSubject" | "localBody",
    value: string,
  ) => {
    setLocalJobs((prev) =>
      prev.map((j) =>
        j.id === jobId ? { ...j, [key]: value } : j,
      ),
    );
  };

  if (localJobs.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center border-dashed py-10 text-center text-xs text-muted-foreground">
        <Bot className="mb-2 h-5 w-5" />
        No AI drafts waiting for review.
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {localJobs.map((job) => {
        const lead = job.leads;
        const name = lead
          ? `${lead.first_name || ""} ${lead.last_name || ""}`.trim() ||
            lead.email ||
            "Unknown lead"
          : "Unknown lead";

        return (
          <Card key={job.id} className="space-y-3 p-4 text-xs">
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {name}
                  </span>
                  {lead?.company && (
                    <span className="text-[11px] text-muted-foreground">
                      · {lead.company}
                    </span>
                  )}
                </div>
                {lead?.email && (
                  <span className="text-[11px] text-muted-foreground">
                    {lead.email}
                  </span>
                )}
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge
                  variant="outline"
                  className="border-purple-500/40 bg-purple-500/5 text-[10px] text-purple-500"
                >
                  {job.template_key}
                </Badge>
                <span className="text-[10px] text-muted-foreground">
                  Scheduled: {formatTime(job.scheduled_at)}
                </span>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-[1.5fr,3fr]">
              <div className="space-y-2">
                <div>
                  <label className="text-[11px] font-medium">
                    Subject
                  </label>
                  <Input
                    className="mt-1 h-8 text-xs"
                    value={job.localSubject}
                    onChange={(e) =>
                      updateJobField(
                        job.id,
                        "localSubject",
                        e.target.value,
                      )
                    }
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium">
                    Body
                  </label>
                  <Textarea
                    className="mt-1 min-h-[140px] text-xs"
                    value={job.localBody}
                    onChange={(e) =>
                      updateJobField(
                        job.id,
                        "localBody",
                        e.target.value,
                      )
                    }
                  />
                </div>
              </div>

              <div className="space-y-3 rounded-md border bg-muted/40 p-3">
                <p className="text-[11px] font-semibold text-muted-foreground">
                  Preview
                </p>
                <div className="rounded bg-background px-2 py-2 text-[11px] shadow-sm">
                  <p className="mb-1 text-[11px] font-medium">
                    To: {lead?.email || "unknown"}
                  </p>
                  <p className="mb-1 text-[11px]">
                    Subject: {job.localSubject}
                  </p>
                  <hr className="my-2" />
                  <pre className="whitespace-pre-wrap text-[11px]">
                    {job.localBody}
                  </pre>
                </div>

                <div className="flex items-center justify-between gap-2 pt-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px]"
                    disabled={job.saving}
                    onClick={() => handleAction(job.id, "skip")}
                  >
                    {job.saving ? (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    ) : (
                      <X className="mr-1 h-3 w-3" />
                    )}
                    Skip
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-7 text-[11px]"
                    disabled={job.saving}
                    onClick={() => handleAction(job.id, "approve")}
                  >
                    {job.saving ? (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    ) : (
                      <Check className="mr-1 h-3 w-3" />
                    )}
                    Approve & Send
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

