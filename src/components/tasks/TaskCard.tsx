"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Calendar, User, AlertCircle } from "lucide-react";
import type { Task } from "@/app/api/tasks/route";
import Link from "next/link";

interface TaskCardProps {
  task: Task;
  onClick: () => void;
}

export function TaskCard({ task, onClick }: TaskCardProps) {
  const isOverdue = !task.completed && new Date(task.dueAt) < new Date();
  const priorityColors = {
    high: "bg-red-500/20 text-red-500 border-red-500/30",
    normal: "bg-blue-500/20 text-blue-500 border-blue-500/30",
    low: "bg-gray-500/20 text-gray-500 border-gray-500/30",
  };

  return (
    <Card
      className={`p-3 hover:shadow-md transition-shadow cursor-pointer ${
        isOverdue ? "border-red-500/50" : ""
      }`}
      onClick={onClick}
    >
      <div className="space-y-2">
        {/* Priority Badge */}
        {task.priority === "high" && (
          <div className="flex items-center gap-1">
            <AlertCircle className="h-3 w-3 text-red-500" />
            <Badge
              variant="outline"
              className={`text-xs ${priorityColors[task.priority]}`}
            >
              High Priority
            </Badge>
          </div>
        )}

        {/* Title */}
        <p className="font-medium text-sm line-clamp-2">{task.title}</p>

        {/* Notes preview */}
        {task.notes && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {task.notes}
          </p>
        )}

        {/* Contact link */}
        {task.contactId && (
          <Link
            href={`/contacts/${task.contactId}`}
            onClick={(e) => e.stopPropagation()}
            className="text-xs text-blue-500 hover:underline flex items-center gap-1"
          >
            <User className="h-3 w-3" />
            View Contact
          </Link>
        )}

        {/* Thread link */}
        {task.replyThreadId && (
          <Link
            href={`/inbox/replies?threadId=${task.replyThreadId}`}
            onClick={(e) => e.stopPropagation()}
            className="text-xs text-blue-500 hover:underline"
          >
            View Thread →
          </Link>
        )}

        {/* Due date */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Calendar className="h-3 w-3" />
          <span className={isOverdue ? "text-red-500 font-medium" : ""}>
            {format(new Date(task.dueAt), "MMM d, yyyy")}
          </span>
        </div>

        {/* Assigned to */}
        {task.assignedTo && (
          <div className="text-xs text-muted-foreground">
            Assigned: {task.assignedTo.substring(0, 8)}...
          </div>
        )}
      </div>
    </Card>
  );
}





























































