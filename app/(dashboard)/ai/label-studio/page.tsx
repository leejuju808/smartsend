'use client';

import { useCallback, useEffect, useState } from "react";
import { createClientComponentClient } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const LABELS = [
  "positive",
  "negative",
  "neutral",
  "question",
  "unsubscribe",
  "bounce",
  "oof",
] as const;

type Label = (typeof LABELS)[number];

type LabelTask = {
  id: string;
  source: string;
  priority: number;
  status: string;
  text_excerpt: string;
  suggested_label?: string | null;
  model_version_tag?: string | null;
};

export default function LabelStudio() {
  const [task, setTask] = useState<LabelTask | null>(null);
  const [notes, setNotes] = useState("");
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [loadingTask, setLoadingTask] = useState(false);

  useEffect(() => {
    const supabase = createClientComponentClient();
    supabase.auth.getUser().then(({ data, error }) => {
      if (error) {
        console.error("Failed to load user", error);
        toast.error("Unable to load user");
        return;
      }
      if (!data.user?.id) {
        toast.error("No authenticated user");
      }
      setAssigneeId(data.user?.id ?? null);
    });
  }, []);

  const grab = useCallback(async () => {
    if (!assigneeId) {
      toast.error("No assignee available");
      return;
    }
    setLoadingTask(true);
    try {
      const r = await fetch("/api/label/next", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignee: assigneeId }),
      });
      const j = await r.json().catch(() => ({ ok: false, error: "invalid response" }));
      if (!r.ok || !j.ok) {
        setTask(null);
        toast.info(j.error ?? "Queue empty");
        return;
      }
      setTask(j.task);
      setNotes("");
    } catch (error) {
      console.error("Failed to grab task", error);
      toast.error("Failed to grab next task");
    } finally {
      setLoadingTask(false);
    }
  }, [assigneeId]);

  const submit = useCallback(
    async (label: Label) => {
      if (!task || !assigneeId) return;
      try {
        const r = await fetch("/api/label/submit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            task_id: task.id,
            assignee: assigneeId,
            label,
            notes,
          }),
        });
        const j = await r.json().catch(() => ({ ok: false, error: "invalid response" }));
        if (!r.ok || !j.ok) {
          toast.error(j.error ?? "Submit failed");
          return;
        }
        toast.success(`Labeled: ${label}`);
        await grab();
      } catch (error) {
        console.error("Submit failed", error);
        toast.error("Submit failed");
      }
    },
    [task, assigneeId, notes, grab],
  );

  const skip = useCallback(async () => {
    if (!task || !assigneeId) return;
    try {
      const r = await fetch("/api/label/skip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_id: task.id, assignee: assigneeId }),
      });
      const j = await r.json().catch(() => ({ ok: false, error: "invalid response" }));
      if (!r.ok || !j.ok) {
        toast.error(j.error ?? "Skip failed");
        return;
      }
      toast.message("Skipped");
      await grab();
    } catch (error) {
      console.error("Skip failed", error);
      toast.error("Skip failed");
    }
  }, [task, assigneeId, grab]);

  const enqueueActive = useCallback(async () => {
    try {
      const r = await fetch("/api/label/active/enqueue", { method: "POST" });
      const j = await r.json().catch(() => ({ ok: false, error: "invalid response" }));
      if (!r.ok || !j.ok) {
        toast.error(j.error ?? "Enqueue failed");
        return;
      }
      toast.success("Active learning queue refreshed");
    } catch (error) {
      console.error("Active enqueue failed", error);
      toast.error("Enqueue failed");
    }
  }, []);

  useEffect(() => {
    if (assigneeId) {
      void grab();
    }
  }, [assigneeId, grab]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!task) return;
      if (e.key === "s") {
        e.preventDefault();
        void skip();
      } else if (e.key === "n") {
        e.preventDefault();
        void grab();
      } else {
        const idx = Number(e.key);
        if (Number.isInteger(idx) && idx >= 1 && idx <= LABELS.length) {
          e.preventDefault();
          void submit(LABELS[idx - 1]);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [task, grab, skip, submit]);

  return (
    <div className="grid gap-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Label Studio — Active Queue</CardTitle>
        </CardHeader>
        <CardContent>
          {!assigneeId ? (
            <div className="text-sm text-muted-foreground">
              Sign in to start labeling.
            </div>
          ) : loadingTask ? (
            <div className="text-sm text-muted-foreground">Loading task…</div>
          ) : !task ? (
            <div className="text-sm text-muted-foreground">
              No task. Click “Enqueue Active Learning” then press “Next”.
            </div>
          ) : (
            <div className="grid gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant="secondary">{task.source}</Badge>
                <Badge>priority {task.priority}</Badge>
                <Badge variant={task.status === "assigned" ? "default" : "outline"}>
                  {task.status}
                </Badge>
                {task.suggested_label ? (
                  <Badge variant="outline">suggested: {task.suggested_label}</Badge>
                ) : null}
                {task.model_version_tag ? (
                  <Badge variant="outline">{task.model_version_tag}</Badge>
                ) : null}
              </div>
              <pre className="max-h-[45vh] overflow-auto whitespace-pre-wrap rounded-2xl border p-4 text-sm">
                {task.text_excerpt}
              </pre>
              <div className="flex flex-wrap gap-2">
                {LABELS.map((label, index) => (
                  <Button key={label} onClick={() => void submit(label)}>
                    {index + 1}. {label}
                  </Button>
                ))}
                <Button variant="secondary" onClick={() => void skip()}>
                  s. Skip
                </Button>
                <Button variant="outline" onClick={() => void grab()}>
                  n. Next
                </Button>
              </div>
              <Textarea
                placeholder="Notes (optional)"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Queue Controls</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Button onClick={() => void enqueueActive()}>
            Enqueue Active Learning (uncertainty + disagreements)
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

















