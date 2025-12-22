"use client";

import { useState, useEffect } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Calendar, User, MessageSquare, Trash2, Check } from "lucide-react";
import Link from "next/link";
import type { Task } from "@/app/api/tasks/route";

interface TaskDetailPanelProps {
  task: Task;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTaskUpdate: () => void;
}

export function TaskDetailPanel({
  task,
  open,
  onOpenChange,
  onTaskUpdate,
}: TaskDetailPanelProps) {
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes || "");
  const [dueAt, setDueAt] = useState(
    task.dueAt ? format(new Date(task.dueAt), "yyyy-MM-dd'T'HH:mm") : ""
  );
  const [priority, setPriority] = useState<"low" | "normal" | "high">(
    task.priority || "normal"
  );
  const [status, setStatus] = useState<"open" | "completed">(
    task.status || "open"
  );
  const [assignedTo, setAssignedTo] = useState(task.assignedTo || "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(task.title);
      setNotes(task.notes || "");
      setDueAt(
        task.dueAt ? format(new Date(task.dueAt), "yyyy-MM-dd'T'HH:mm") : ""
      );
      setPriority(task.priority || "normal");
      setStatus(task.status || "open");
      setAssignedTo(task.assignedTo || "");
    }
  }, [task, open]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          notes,
          dueAt: new Date(dueAt).toISOString(),
          priority,
          status,
          assignedTo: assignedTo || null,
        }),
      });

      if (res.ok) {
        onTaskUpdate();
      }
    } catch (error) {
      console.error("Error updating task:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this task?")) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        onTaskUpdate();
        onOpenChange(false);
      }
    } catch (error) {
      console.error("Error deleting task:", error);
    } finally {
      setDeleting(false);
    }
  };

  const handleComplete = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}/complete`, {
        method: "POST",
      });

      if (res.ok) {
        onTaskUpdate();
      }
    } catch (error) {
      console.error("Error completing task:", error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[90vh]">
        <DrawerHeader>
          <DrawerTitle>Task Details</DrawerTitle>
        </DrawerHeader>

        <div className="overflow-y-auto px-4 pb-4 space-y-4">
          {/* Title */}
          <div>
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title"
            />
          </div>

          {/* Description */}
          <div>
            <Label htmlFor="notes">Description</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Task description"
              rows={4}
            />
          </div>

          {/* Due Date */}
          <div>
            <Label htmlFor="dueAt">Due Date</Label>
            <Input
              id="dueAt"
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
            />
          </div>

          {/* Priority */}
          <div>
            <Label htmlFor="priority">Priority</Label>
            <Select value={priority} onValueChange={(v: any) => setPriority(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Status */}
          <div>
            <Label htmlFor="status">Status</Label>
            <Select value={status} onValueChange={(v: any) => setStatus(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Assigned To */}
          <div>
            <Label htmlFor="assignedTo">Assigned To</Label>
            <Input
              id="assignedTo"
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              placeholder="User ID (or leave empty for unassigned)"
            />
          </div>

          {/* Links */}
          <div className="space-y-2 pt-4 border-t">
            {task.contactId && (
              <Link
                href={`/contacts/${task.contactId}`}
                className="flex items-center gap-2 text-sm text-blue-500 hover:underline"
              >
                <User className="h-4 w-4" />
                View Contact
              </Link>
            )}
            {task.replyThreadId && (
              <Link
                href={`/inbox/replies?threadId=${task.replyThreadId}`}
                className="flex items-center gap-2 text-sm text-blue-500 hover:underline"
              >
                <MessageSquare className="h-4 w-4" />
                View Reply Thread
              </Link>
            )}
          </div>

          {/* Task Timeline */}
          <div className="pt-4 border-t">
            <h3 className="text-sm font-medium mb-2">Timeline</h3>
            <div className="space-y-2 text-sm text-muted-foreground">
              <div>Created: {format(new Date(task.createdAt), "MMM d, yyyy 'at' h:mm a")}</div>
              {task.completedAt && (
                <div>
                  Completed: {format(new Date(task.completedAt), "MMM d, yyyy 'at' h:mm a")}
                </div>
              )}
              <div>Last updated: {format(new Date(task.updatedAt), "MMM d, yyyy 'at' h:mm a")}</div>
            </div>
          </div>
        </div>

        <DrawerFooter className="flex-row gap-2">
          <Button
            variant="outline"
            onClick={handleDelete}
            disabled={deleting}
            className="text-red-500"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>
          {!task.completed && (
            <Button onClick={handleComplete} disabled={saving}>
              <Check className="h-4 w-4 mr-2" />
              Mark Complete
            </Button>
          )}
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}





























































