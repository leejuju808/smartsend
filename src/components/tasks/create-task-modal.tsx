"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type TeamMember = {
  user_id: string;
  email: string | null;
};

export function CreateTaskModal({
  threadId,
  open,
  onClose,
}: {
  threadId: string;
  open: boolean;
  onClose: () => void;
}) {
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignedTo, setAssignedTo] = useState<string>("");
  const [dueDate, setDueDate] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      loadTeam();
    }
  }, [open]);

  const loadTeam = async () => {
    try {
      const res = await fetch("/api/team/members");
      if (res.ok) {
        const data = await res.json();
        setTeam(data.members || []);
      }
    } catch (error) {
      console.error("Error loading team:", error);
    }
  };

  const handleSave = async () => {
    if (!title.trim()) {
      alert("Task title is required");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/tasks/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thread_id: threadId || null,
          title: title.trim(),
          description: description.trim() || null,
          assigned_to: assignedTo || null,
          due_date: dueDate || null,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create task");
      }

      // Reset form
      setTitle("");
      setDescription("");
      setAssignedTo("");
      setDueDate("");
      onClose();
    } catch (error) {
      console.error("Error creating task:", error);
      alert(error instanceof Error ? error.message : "Failed to create task");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="space-y-4 max-w-md">
        <DialogHeader>
          <DialogTitle>Create Task</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="title">Task Title *</Label>
          <Input
            id="title"
            placeholder="e.g., Follow up with ABC Corp"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSave();
              }
            }}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            placeholder="Optional details..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="assign">Assign To</Label>
          <Select value={assignedTo} onValueChange={setAssignedTo}>
            <SelectTrigger id="assign">
              <SelectValue placeholder="Select team member" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">Unassigned</SelectItem>
              {team.map((member) => (
                <SelectItem key={member.user_id} value={member.user_id}>
                  {member.email || member.user_id.slice(0, 8)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="due_date">Due Date</Label>
          <Input
            id="due_date"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading || !title.trim()}>
            {loading ? "Creating..." : "Create Task"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

