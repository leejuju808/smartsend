"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";

interface RowActionsProps {
  row: {
    log_id: string;
    org_id: string;
    campaign_id: string;
    lead_id: string;
    assignee_id?: string | null;
    snoozed_until?: string | null;
  };
  teammates: { id: string; name: string; email?: string }[];
  onUpdate?: () => void;
}

export function RowActions({ row, teammates, onUpdate }: RowActionsProps) {
  const [assignOpen, setAssignOpen] = useState(false);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [dueDate, setDueDate] = useState<string>("");
  const [taskOpen, setTaskOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskNotes, setTaskNotes] = useState("");
  const [taskDueDate, setTaskDueDate] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const assign = async (assignee_id: string | null) => {
    setLoading(true);
    try {
      const res = await fetch("/api/inbox/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ log_id: row.log_id, assignee_id }),
      });
      if (res.ok) {
        setAssignOpen(false);
        onUpdate?.();
      }
    } catch (error) {
      console.error("Failed to assign:", error);
    } finally {
      setLoading(false);
    }
  };

  const snooze = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/inbox/snooze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          log_id: row.log_id,
          until: dueDate ? new Date(dueDate).toISOString() : null,
        }),
      });
      if (res.ok) {
        setSnoozeOpen(false);
        setDueDate("");
        onUpdate?.();
      }
    } catch (error) {
      console.error("Failed to snooze:", error);
    } finally {
      setLoading(false);
    }
  };

  const createTask = async () => {
    if (!taskTitle.trim()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/inbox/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_id: row.org_id,
          campaign_id: row.campaign_id,
          lead_id: row.lead_id,
          log_id: row.log_id,
          title: taskTitle,
          notes: taskNotes,
          assignee_id: row.assignee_id || null,
          due_at: taskDueDate ? new Date(taskDueDate).toISOString() : null,
        }),
      });
      if (res.ok) {
        setTaskOpen(false);
        setTaskTitle("");
        setTaskNotes("");
        setTaskDueDate("");
        onUpdate?.();
      }
    } catch (error) {
      console.error("Failed to create task:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex gap-2">
      {/* Assign */}
      <Popover open={assignOpen} onOpenChange={setAssignOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" disabled={loading}>
            Assign
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64">
          <div className="space-y-1">
            <button
              onClick={() => assign(null)}
              className="w-full text-left px-3 py-2 rounded hover:bg-muted text-sm"
            >
              Unassign
            </button>
            {teammates.map((t) => (
              <button
                key={t.id}
                onClick={() => assign(t.id)}
                className="w-full text-left px-3 py-2 rounded hover:bg-muted text-sm"
              >
                {t.name || t.email || t.id}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {/* Snooze */}
      <Popover open={snoozeOpen} onOpenChange={setSnoozeOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" disabled={loading}>
            Snooze
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 space-y-3">
          <div>
            <label className="text-sm font-medium mb-1 block">Snooze until</label>
            <Input
              type="datetime-local"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={snooze} disabled={loading}>
              Save
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setDueDate("");
                snooze();
              }}
              disabled={loading}
            >
              Clear
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {/* Follow-up Task */}
      <Popover open={taskOpen} onOpenChange={setTaskOpen}>
        <PopoverTrigger asChild>
          <Button size="sm" disabled={loading}>
            Follow-up
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 space-y-3">
          <div>
            <label className="text-sm font-medium mb-1 block">Title</label>
            <Input
              placeholder="e.g., Send pricing"
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Notes</label>
            <Textarea
              rows={3}
              placeholder="Optional notes"
              value={taskNotes}
              onChange={(e) => setTaskNotes(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Due date</label>
            <Input
              type="datetime-local"
              value={taskDueDate}
              onChange={(e) => setTaskDueDate(e.target.value)}
            />
          </div>
          <Button size="sm" onClick={createTask} disabled={!taskTitle.trim() || loading}>
            Create Task
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  );
}

