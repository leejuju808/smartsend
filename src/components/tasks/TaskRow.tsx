"use client";

import { Task } from "@/app/api/tasks/route";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/Button";
import { useUpdateTask, useDeleteTask } from "@/hooks/useTasks";
import { MoreVertical, Calendar, User, MessageSquare, Trash2, Edit } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
// Date utilities
const formatDate = (date: Date) => {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const isPast = (date: Date) => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const compareDate = new Date(date);
  compareDate.setHours(0, 0, 0, 0);
  return compareDate < now;
};

const isToday = (date: Date) => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const compareDate = new Date(date);
  compareDate.setHours(0, 0, 0, 0);
  return compareDate.getTime() === now.getTime();
};

const isTomorrow = (date: Date) => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const compareDate = new Date(date);
  compareDate.setHours(0, 0, 0, 0);
  return compareDate.getTime() === tomorrow.getTime();
};

interface TaskRowProps {
  task: Task;
  onUpdate?: () => void;
}

export function TaskRow({ task, onUpdate }: TaskRowProps) {
  const { updateTask } = useUpdateTask();
  const { deleteTask } = useDeleteTask();
  const [showMenu, setShowMenu] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleToggleComplete = async () => {
    setIsCompleting(true);
    try {
      await updateTask(task.id, { completed: !task.completed });
      onUpdate?.();
    } catch (error) {
      console.error("Failed to update task:", error);
    } finally {
      setIsCompleting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this task?")) return;
    setIsDeleting(true);
    try {
      await deleteTask(task.id);
      onUpdate?.();
    } catch (error) {
      console.error("Failed to delete task:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  const dueDate = new Date(task.dueAt);
  const isOverdue = isPast(dueDate) && !task.completed;
  const isDueToday = isToday(dueDate) && !task.completed;
  const isDueTomorrow = isTomorrow(dueDate) && !task.completed;

  // Get task type icon
  const getTaskTypeIcon = () => {
    if (task.autoType === "hot_lead") return "🔥";
    if (task.autoType === "warm_lead") return "🔥";
    if (task.autoType === "no_reply") return "📧";
    if (task.autoType === "inspection_reminder") return "📅";
    return "📝";
  };

  // Get intent badge color
  const getIntentBadgeColor = () => {
    if (task.autoType === "hot_lead") return "bg-red-100 text-red-800";
    if (task.autoType === "warm_lead") return "bg-orange-100 text-orange-800";
    return "bg-gray-100 text-gray-800";
  };

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
        task.completed
          ? "bg-gray-50 opacity-60"
          : isOverdue
          ? "bg-red-50 border-red-200"
          : "bg-white hover:bg-gray-50"
      }`}
    >
      <Checkbox
        checked={task.completed}
        onCheckedChange={handleToggleComplete}
        disabled={isCompleting}
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-lg">{getTaskTypeIcon()}</span>
          <span
            className={`font-medium ${
              task.completed ? "line-through text-gray-500" : ""
            }`}
          >
            {task.title}
          </span>
          {task.autoType && (
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${getIntentBadgeColor()}`}
            >
              {task.autoType.replace("_", " ")}
            </span>
          )}
        </div>

        <div className="flex items-center gap-4 mt-1 text-sm text-gray-600">
          {task.contactId && (
            <Link
              href={`/contacts/${task.contactId}`}
              className="flex items-center gap-1 hover:text-primary"
            >
              <User className="w-3 h-3" />
              <span>Contact</span>
            </Link>
          )}
          {task.replyThreadId && (
            <Link
              href={`/inbox/replies?threadId=${task.replyThreadId}`}
              className="flex items-center gap-1 hover:text-primary"
            >
              <MessageSquare className="w-3 h-3" />
              <span>Reply</span>
            </Link>
          )}
          <div className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            <span
              className={
                isOverdue
                  ? "text-red-600 font-medium"
                  : isDueToday
                  ? "text-orange-600 font-medium"
                  : ""
              }
            >
              {isDueToday
                ? "Today"
                : isDueTomorrow
                ? "Tomorrow"
                : formatDate(dueDate)}
              {isOverdue && " (Overdue)"}
            </span>
          </div>
        </div>

        {task.notes && (
          <p className="text-sm text-gray-500 mt-1 line-clamp-1">{task.notes}</p>
        )}
      </div>

      <div className="relative">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowMenu(!showMenu)}
          className="h-8 w-8 p-0"
        >
          <MoreVertical className="w-4 h-4" />
        </Button>

        {showMenu && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setShowMenu(false)}
            />
            <div className="absolute right-0 top-8 z-20 bg-white border rounded-lg shadow-lg py-1 min-w-[120px]">
              <button
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 flex items-center gap-2"
                onClick={() => {
                  setShowMenu(false);
                  // TODO: Open edit modal
                }}
              >
                <Edit className="w-4 h-4" />
                Edit
              </button>
              <button
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 text-red-600 flex items-center gap-2"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

