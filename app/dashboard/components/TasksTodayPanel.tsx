"use client";

import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/src/components/ui/checkbox";
import { Clock } from "lucide-react";
import { useState } from "react";

interface Task {
  id: string;
  title: string;
  dueAt: string;
  overdue: boolean;
  contactId?: string | null;
  contactName?: string | null;
}

interface TasksTodayPanelProps {
  tasks: Task[];
}

export function TasksTodayPanel({ tasks }: TasksTodayPanelProps) {
  const [completedTasks, setCompletedTasks] = useState<Set<string>>(new Set());

  const handleComplete = async (taskId: string) => {
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: true }),
      });

      if (response.ok) {
        setCompletedTasks((prev) => new Set(prev).add(taskId));
      }
    } catch (error) {
      console.error("Failed to complete task:", error);
    }
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  };

  const visibleTasks = tasks.filter((t) => !completedTasks.has(t.id));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-yellow-500" />
          Tasks Due Today
        </CardTitle>
      </CardHeader>
      <CardContent>
        {visibleTasks.length === 0 ? (
          <div className="text-sm text-muted-foreground py-4">
            {tasks.length === 0
              ? "No tasks due today. Good. But don't forget to follow up your HOT leads."
              : "All tasks completed! 🎉"}
          </div>
        ) : (
          <div className="space-y-2">
            {visibleTasks.map((task) => (
              <div
                key={task.id}
                className="flex items-start gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
              >
                <Checkbox
                  checked={completedTasks.has(task.id)}
                  onCheckedChange={() => handleComplete(task.id)}
                  className="mt-1"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium">{task.title}</span>
                    {task.overdue && (
                      <Badge variant="destructive">Overdue</Badge>
                    )}
                  </div>
                  {task.contactName && (
                    <Link
                      href={task.contactId ? `/contacts/${task.contactId}` : "#"}
                      className="text-sm text-muted-foreground hover:underline"
                    >
                      {task.contactName}
                    </Link>
                  )}
                </div>
                <div className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatTime(task.dueAt)}
                </div>
              </div>
            ))}
          </div>
        )}
        {tasks.length > 0 && (
          <Link
            href="/tasks?filter=today"
            className="block mt-4 text-sm text-primary hover:underline text-center"
          >
            View all tasks →
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

