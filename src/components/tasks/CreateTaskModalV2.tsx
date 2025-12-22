"use client";

import { useState, useEffect } from "react";
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
import { useToast } from "@/src/components/ui/toast/ToastProvider";
import { CalendarIcon, Clock } from "lucide-react";
import { format } from "date-fns";

interface TeamMember {
  user_id: string;
  email: string | null;
  name?: string | null;
}

interface CreateTaskModalV2Props {
  open: boolean;
  onClose: () => void;
  onTaskCreated: () => void;
  contactId?: string;
  threadId?: string;
  jobId?: string;
  defaultPriority?: "low" | "medium" | "high";
  defaultDueDate?: Date;
}

export function CreateTaskModalV2({
  open,
  onClose,
  onTaskCreated,
  contactId,
  threadId,
  jobId,
  defaultPriority = "medium",
  defaultDueDate,
}: CreateTaskModalV2Props) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high">(defaultPriority);
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [assignedTo, setAssignedTo] = useState<string>("");
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingTeam, setLoadingTeam] = useState(false);
  const toast = useToast();

  // Format date for input (YYYY-MM-DD)
  const formatDateInput = (date: Date) => {
    return format(date, "yyyy-MM-dd");
  };

  // Format time for input (HH:mm)
  const formatTimeInput = (date: Date) => {
    return format(date, "HH:mm");
  };

  // Initialize form with defaults
  useEffect(() => {
    if (open) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, 0, 0, 0); // Default to 9 AM

      setDueDate(defaultDueDate ? formatDateInput(defaultDueDate) : formatDateInput(tomorrow));
      setDueTime(defaultDueDate ? formatTimeInput(defaultDueDate) : formatTimeInput(tomorrow));
      setPriority(defaultPriority);
      setTitle("");
      setDescription("");
      setAssignedTo("");
      loadTeamMembers();
    }
  }, [open, defaultPriority, defaultDueDate]);

  const loadTeamMembers = async () => {
    setLoadingTeam(true);
    try {
      // Try multiple endpoints to get team members
      const endpoints = [
        "/api/workspace/team/list",
        "/api/team/members",
        "/api/inbox/workspace-members",
      ];

      for (const endpoint of endpoints) {
        try {
          const res = await fetch(endpoint);
          if (res.ok) {
            const data = await res.json();
            if (data.members && Array.isArray(data.members)) {
              setTeamMembers(data.members);
              return;
            }
            if (Array.isArray(data)) {
              setTeamMembers(data);
              return;
            }
          }
        } catch (e) {
          // Try next endpoint
        }
      }

      // Fallback: empty list
      setTeamMembers([]);
    } catch (error) {
      console.error("Error loading team members:", error);
      setTeamMembers([]);
    } finally {
      setLoadingTeam(false);
    }
  };

  const handleSave = async () => {
    if (!title.trim()) {
      toast.push({
        title: "Title is required",
        type: "error",
        duration: 3000,
      });
      return;
    }

    if (!dueDate) {
      toast.push({
        title: "Due date is required",
        type: "error",
        duration: 3000,
      });
      return;
    }

    setLoading(true);
    try {
      // Combine date and time
      const dueAt = new Date(`${dueDate}T${dueTime || "09:00"}`);
      if (isNaN(dueAt.getTime())) {
        throw new Error("Invalid date/time");
      }

      const res = await fetch("/api/tasks/v2/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          priority,
          due_at: dueAt.toISOString(),
          assigned_to: assignedTo || null,
          contact_id: contactId || null,
          thread_id: threadId || null,
          job_id: jobId || null,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create task");
      }

      const data = await res.json();

      // Show success toast
      toast.push({
        title: "Task created successfully",
        type: "success",
        duration: 3000,
      });

      // Reset form
      setTitle("");
      setDescription("");
      setDueDate("");
      setDueTime("");
      setAssignedTo("");
      setPriority("medium");

      // Callback
      onTaskCreated();
      onClose();
    } catch (error: any) {
      console.error("Error creating task:", error);
      toast.push({
        title: error.message || "Failed to create task",
        type: "error",
        duration: 3000,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Task</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Title *</Label>
            <Input
              id="title"
              placeholder="e.g., Follow up with homeowner about leak"
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

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Optional details about the task..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          {/* Priority */}
          <div className="space-y-2">
            <Label htmlFor="priority">Priority</Label>
            <Select value={priority} onValueChange={(v: any) => setPriority(v)}>
              <SelectTrigger id="priority">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Due Date & Time */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="dueDate">
                <CalendarIcon className="inline h-4 w-4 mr-1" />
                Due Date *
              </Label>
              <Input
                id="dueDate"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                min={formatDateInput(new Date())}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dueTime">
                <Clock className="inline h-4 w-4 mr-1" />
                Time
              </Label>
              <Input
                id="dueTime"
                type="time"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
              />
            </div>
          </div>

          {/* Assign To */}
          <div className="space-y-2">
            <Label htmlFor="assignTo">Assign To</Label>
            <Select value={assignedTo} onValueChange={setAssignedTo}>
              <SelectTrigger id="assignTo">
                <SelectValue placeholder={loadingTeam ? "Loading..." : "Select team member"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Unassigned</SelectItem>
                <SelectItem value="me">Me</SelectItem>
                {teamMembers.map((member) => (
                  <SelectItem key={member.user_id} value={member.user_id}>
                    {member.name || member.email || member.user_id.slice(0, 8)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Related To Info */}
          {(contactId || threadId || jobId) && (
            <div className="text-sm text-muted-foreground p-2 bg-muted rounded-md">
              <div className="font-medium mb-1">Related To:</div>
              {contactId && <div>• This contact</div>}
              {threadId && <div>• This thread</div>}
              {jobId && <div>• This job</div>}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={loading || !title.trim() || !dueDate}>
            {loading ? "Creating..." : "Save Task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}



















































