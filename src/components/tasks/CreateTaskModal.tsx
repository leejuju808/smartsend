"use client";

import { useState } from "react";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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

interface CreateTaskModalProps {
  open: boolean;
  onClose: () => void;
  onTaskCreated: () => void;
  contactId?: string;
  leadId?: string; // Roofing-specific
  replyThreadId?: string;
  campaignId?: string;
  defaultPriority?: "low" | "normal" | "high";
  defaultDueDate?: Date;
  defaultType?: "callback" | "appointment" | "quote_followup"; // Roofing-specific
}

export function CreateTaskModal({
  open,
  onClose,
  onTaskCreated,
  contactId,
  leadId, // Roofing-specific
  replyThreadId,
  campaignId,
  defaultPriority = "normal",
  defaultDueDate,
  defaultType, // Roofing-specific
}: CreateTaskModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState(""); // Roofing-specific
  const [notes, setNotes] = useState("");
  const [dueAt, setDueAt] = useState(
    defaultDueDate
      ? formatDateTimeLocal(defaultDueDate)
      : formatDateTimeLocal(new Date(Date.now() + 24 * 60 * 60 * 1000)) // Tomorrow
  );
  const [priority, setPriority] = useState<"low" | "normal" | "high">(
    defaultPriority
  );
  const [type, setType] = useState<"callback" | "appointment" | "quote_followup" | "">(
    defaultType || "" // Roofing-specific
  );
  const [assignedTo, setAssignedTo] = useState("");
  const [creating, setCreating] = useState(false);

  const formatDateTimeLocal = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const handleCreate = async () => {
    if (!title.trim() || !dueAt || !type) {
      alert("Please fill in task type, description, and due date");
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description: description || undefined, // Roofing-specific
          notes: notes || undefined,
          dueAt: new Date(dueAt).toISOString(),
          priority,
          type: type || undefined, // Roofing-specific
          assignedTo: assignedTo || undefined,
          contactId,
          leadId, // Roofing-specific
          replyThreadId,
          campaignId,
        }),
      });

      if (res.ok) {
        setTitle("");
        setDescription("");
        setNotes("");
        setDueAt(
          formatDateTimeLocal(new Date(Date.now() + 24 * 60 * 60 * 1000))
        );
        setPriority("normal");
        setType("");
        setAssignedTo("");
        onTaskCreated();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to create task");
      }
    } catch (error) {
      console.error("Error creating task:", error);
      alert("Failed to create task");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Task</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Task Type (Roofing-specific) */}
          <div>
            <Label htmlFor="type">Task Type *</Label>
            <Select value={type} onValueChange={(v: any) => setType(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select task type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="callback">Callback</SelectItem>
                <SelectItem value="appointment">Appointment</SelectItem>
                <SelectItem value="quote_followup">Quote Follow-Up</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Title */}
          <div>
            <Label htmlFor="title">Description *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Call John about his leak tomorrow morning"
            />
          </div>

          {/* Additional Description (Roofing-specific) */}
          <div>
            <Label htmlFor="description">Additional Details</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional additional details"
              rows={2}
            />
          </div>

          {/* Notes */}
          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Internal notes"
              rows={2}
            />
          </div>

          {/* Due Date */}
          <div>
            <Label htmlFor="dueAt">Due Date *</Label>
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

          {/* Assigned To */}
          <div>
            <Label htmlFor="assignedTo">Assigned To</Label>
            <Input
              id="assignedTo"
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              placeholder="User ID (leave empty for unassigned)"
            />
          </div>

          {/* Auto-filled info */}
          {(contactId || leadId || replyThreadId) && (
            <div className="text-sm text-muted-foreground">
              {contactId && <div>Linked to contact</div>}
              {leadId && <div>Linked to lead</div>}
              {replyThreadId && <div>Linked to reply thread</div>}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={creating}>
            {creating ? "Creating..." : "Create Task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
