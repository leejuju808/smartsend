"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";
import { Calendar, Clock, User, AlertCircle, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type TaskStatus = "open" | "in_progress" | "completed" | "cancelled";
type TaskPriority = "low" | "medium" | "high";
type TaskView = "today" | "this_week" | "overdue" | "completed" | "assigned_to_me" | "assigned_to_others";

interface Task {
  id: string;
  title: string;
  description: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  due_at: string;
  completed_at: string | null;
  assigned_to: string | null;
  contact_id: string | null;
  thread_id: string | null;
  contact?: {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
  };
  assigned_user?: {
    id: string;
    email: string | null;
  };
}

export function TaskDashboardV2() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<TaskView>("today");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<TaskStatus | "all">("all");
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | "all">("all");

  useEffect(() => {
    loadTasks();
  }, [view, statusFilter, priorityFilter]);

  const loadTasks = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        view,
        ...(statusFilter !== "all" && { status: statusFilter }),
        ...(priorityFilter !== "all" && { priority: priorityFilter }),
        ...(searchQuery && { search: searchQuery }),
      });

      const res = await fetch(`/api/tasks/v2?${params.toString()}`);
      if (!res.ok) {
        throw new Error("Failed to load tasks");
      }

      const data = await res.json();
      setTasks(data.tasks || []);
    } catch (error) {
      console.error("Error loading tasks:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (taskId: string, newStatus: TaskStatus) => {
    try {
      const res = await fetch(`/api/tasks/v2/${taskId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (res.ok) {
        await loadTasks();
      }
    } catch (error) {
      console.error("Error updating task status:", error);
    }
  };

  const getPriorityColor = (priority: TaskPriority) => {
    switch (priority) {
      case "high":
        return "bg-red-100 text-red-700 border-red-300";
      case "medium":
        return "bg-yellow-100 text-yellow-700 border-yellow-300";
      case "low":
        return "bg-gray-100 text-gray-700 border-gray-300";
    }
  };

  const getStatusColor = (status: TaskStatus) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-700 border-green-300";
      case "in_progress":
        return "bg-blue-100 text-blue-700 border-blue-300";
      case "cancelled":
        return "bg-gray-100 text-gray-700 border-gray-300";
      case "open":
        return "bg-orange-100 text-orange-700 border-orange-300";
    }
  };

  const isOverdue = (dueAt: string) => {
    return new Date(dueAt) < new Date() && statusFilter !== "completed";
  };

  const filteredTasks = tasks.filter((task) => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        task.title.toLowerCase().includes(query) ||
        task.description?.toLowerCase().includes(query) ||
        task.contact?.email?.toLowerCase().includes(query)
      );
    }
    return true;
  });

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <div className="border-b p-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold">Tasks</h1>
            <p className="text-sm text-muted-foreground">
              Manage your follow-ups and commitments
            </p>
          </div>
          <Button asChild>
            <Link href="/inbox">Back to Inbox</Link>
          </Button>
        </div>

        {/* View Tabs */}
        <div className="flex gap-2 mb-4">
          {[
            { key: "today", label: "Today" },
            { key: "this_week", label: "This Week" },
            { key: "overdue", label: "Overdue" },
            { key: "assigned_to_me", label: "Assigned to Me" },
            { key: "assigned_to_others", label: "Assigned to Others" },
            { key: "completed", label: "Completed" },
          ].map((tab) => (
            <Button
              key={tab.key}
              variant={view === tab.key ? "default" : "outline"}
              size="sm"
              onClick={() => setView(tab.key as TaskView)}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          <Input
            placeholder="Search tasks..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-xs"
          />
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={(v) => setPriorityFilter(v as any)}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priority</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Task List */}
      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <CheckCircle2 className="h-12 w-12 mb-4 opacity-50" />
            <p className="text-lg font-medium">No tasks found</p>
            <p className="text-sm">Try adjusting your filters or create a new task</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredTasks.map((task) => (
              <div
                key={task.id}
                className={cn(
                  "border rounded-lg p-4 hover:bg-muted/50 transition-colors",
                  isOverdue(task.due_at) && "border-red-300 bg-red-50/50"
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1">
                    <Checkbox
                      checked={task.status === "completed"}
                      onCheckedChange={(checked) => {
                        handleStatusChange(
                          task.id,
                          checked ? "completed" : "open"
                        );
                      }}
                      className="mt-1"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3
                          className={cn(
                            "font-medium",
                            task.status === "completed" && "line-through text-muted-foreground"
                          )}
                        >
                          {task.title}
                        </h3>
                        <Badge className={cn("text-xs", getPriorityColor(task.priority))}>
                          {task.priority}
                        </Badge>
                        <Badge className={cn("text-xs", getStatusColor(task.status))}>
                          {task.status.replace("_", " ")}
                        </Badge>
                        {isOverdue(task.due_at) && (
                          <Badge className="bg-red-600 text-white text-xs">
                            <AlertCircle className="h-3 w-3 mr-1" />
                            Overdue
                          </Badge>
                        )}
                      </div>
                      {task.description && (
                        <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                          {task.description}
                        </p>
                      )}
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(task.due_at), "MMM d, yyyy")}
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {format(new Date(task.due_at), "h:mm a")}
                        </div>
                        {task.contact && (
                          <Link
                            href={`/inbox?thread=${task.thread_id || task.contact_id}`}
                            className="hover:underline"
                          >
                            {task.contact.first_name || task.contact.email}
                          </Link>
                        )}
                        {task.assigned_user && (
                          <div className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {task.assigned_user.email || "Unassigned"}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {task.status !== "completed" && task.status !== "cancelled" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const nextStatus: TaskStatus =
                            task.status === "open" ? "in_progress" : "completed";
                          handleStatusChange(task.id, nextStatus);
                        }}
                      >
                        {task.status === "open" ? "Start" : "Complete"}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}



















































