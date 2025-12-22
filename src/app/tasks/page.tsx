"use client";

import { useState } from "react";
import { useTasks } from "@/hooks/useTasks";
import { TaskRow } from "@/components/tasks/TaskRow";
import { CreateTaskModal } from "@/components/tasks/CreateTaskModal";
import { Button } from "@/components/ui/Button";
import { Plus, Filter, CheckCircle2, Clock, AlertCircle } from "lucide-react";

export default function TasksPage() {
  const [statusFilter, setStatusFilter] = useState<"open" | "completed" | "all">("open");
  const [assignedToFilter, setAssignedToFilter] = useState<"me" | "all">("me");
  const [dateRangeFilter, setDateRangeFilter] = useState<"today" | "week" | "all">("all");
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const { data, loading, error, reload } = useTasks({
    status: statusFilter,
    assignedTo: assignedToFilter,
    dateRange: dateRangeFilter,
  });

  const handleTaskUpdate = () => {
    reload();
  };

  if (loading && !data) {
    return (
      <div className="container mx-auto p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Error loading tasks: {error.message}</p>
        </div>
      </div>
    );
  }

  const grouped = data?.grouped || {
    overdue: [],
    today: [],
    tomorrow: [],
    thisWeek: [],
    later: [],
  };

  const allTasks = data?.data || [];
  const completedTasks = allTasks.filter((t) => t.completed);

  return (
    <div className="container mx-auto p-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Tasks</h1>
          <p className="text-sm text-gray-600 mt-1">
            Manage your follow-ups and reminders
          </p>
        </div>
        <Button onClick={() => setCreateModalOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Create Task
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        <div className="flex items-center gap-2 bg-white border rounded-lg p-2">
          <Filter className="w-4 h-4 text-gray-500" />
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as "open" | "completed" | "all")
            }
            className="border-0 focus:ring-0 text-sm"
          >
            <option value="open">Open</option>
            <option value="completed">Completed</option>
            <option value="all">All</option>
          </select>
        </div>

        <div className="flex items-center gap-2 bg-white border rounded-lg p-2">
          <select
            value={assignedToFilter}
            onChange={(e) =>
              setAssignedToFilter(e.target.value as "me" | "all")
            }
            className="border-0 focus:ring-0 text-sm"
          >
            <option value="me">Assigned to me</option>
            <option value="all">All users</option>
          </select>
        </div>

        <div className="flex items-center gap-2 bg-white border rounded-lg p-2">
          <select
            value={dateRangeFilter}
            onChange={(e) =>
              setDateRangeFilter(e.target.value as "today" | "week" | "all")
            }
            className="border-0 focus:ring-0 text-sm"
          >
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="all">All</option>
          </select>
        </div>
      </div>

      {/* Task Groups */}
      {statusFilter === "open" || statusFilter === "all" ? (
        <div className="space-y-6">
          {/* Overdue */}
          {grouped.overdue.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle className="w-5 h-5 text-red-600" />
                <h2 className="text-lg font-semibold text-red-600">Overdue</h2>
                <span className="text-sm text-gray-500">
                  ({grouped.overdue.length})
                </span>
              </div>
              <div className="space-y-2">
                {grouped.overdue.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    onUpdate={handleTaskUpdate}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Today */}
          {grouped.today.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Clock className="w-5 h-5 text-orange-600" />
                <h2 className="text-lg font-semibold">Today</h2>
                <span className="text-sm text-gray-500">
                  ({grouped.today.length})
                </span>
              </div>
              <div className="space-y-2">
                {grouped.today.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    onUpdate={handleTaskUpdate}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Tomorrow */}
          {grouped.tomorrow.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-lg font-semibold">Tomorrow</h2>
                <span className="text-sm text-gray-500">
                  ({grouped.tomorrow.length})
                </span>
              </div>
              <div className="space-y-2">
                {grouped.tomorrow.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    onUpdate={handleTaskUpdate}
                  />
                ))}
              </div>
            </div>
          )}

          {/* This Week */}
          {grouped.thisWeek.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-lg font-semibold">This Week</h2>
                <span className="text-sm text-gray-500">
                  ({grouped.thisWeek.length})
                </span>
              </div>
              <div className="space-y-2">
                {grouped.thisWeek.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    onUpdate={handleTaskUpdate}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Later */}
          {grouped.later.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-lg font-semibold">Later</h2>
                <span className="text-sm text-gray-500">
                  ({grouped.later.length})
                </span>
              </div>
              <div className="space-y-2">
                {grouped.later.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    onUpdate={handleTaskUpdate}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {allTasks.filter((t) => !t.completed).length === 0 && (
            <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed">
              <p className="text-gray-600 mb-2">No open tasks</p>
              <Button
                variant="outline"
                onClick={() => setCreateModalOpen(true)}
              >
                <Plus className="w-4 h-4 mr-2" />
                Create your first task
              </Button>
            </div>
          )}
        </div>
      ) : null}

      {/* Completed Tasks */}
      {(statusFilter === "completed" || statusFilter === "all") &&
        completedTasks.length > 0 && (
          <div className="mt-8">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              <h2 className="text-lg font-semibold">Completed</h2>
              <span className="text-sm text-gray-500">
                ({completedTasks.length})
              </span>
            </div>
            <div className="space-y-2">
              {completedTasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  onUpdate={handleTaskUpdate}
                />
              ))}
            </div>
          </div>
        )}

      {/* Create Task Modal */}
      <CreateTaskModal
        open={createModalOpen}
        onOpenChange={setCreateModalOpen}
        onSuccess={handleTaskUpdate}
      />
    </div>
  );
}





























































