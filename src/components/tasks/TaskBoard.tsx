"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TaskCard } from "./TaskCard";
import { TaskDetailPanel } from "./TaskDetailPanel";
import type { Task } from "@/app/api/tasks/route";

interface TaskBoardProps {
  tasks: Task[];
  loading: boolean;
  filters: {
    assignedTo: "me" | "all" | string;
    status: "open" | "completed" | "all";
    priority?: "low" | "normal" | "high";
    due?: "today" | "overdue";
  };
  onFiltersChange: (filters: TaskBoardProps["filters"]) => void;
  onTaskUpdate: () => void;
}

export function TaskBoard({
  tasks,
  loading,
  filters,
  onFiltersChange,
  onTaskUpdate,
}: TaskBoardProps) {
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [detailPanelOpen, setDetailPanelOpen] = useState(false);

  // Group tasks by date buckets
  const { today, thisWeek, upcoming, completed } = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.setHours(0, 0, 0, 0));
    const todayEnd = new Date(now.setHours(23, 59, 59, 999));
    const endOfWeek = new Date(todayStart);
    endOfWeek.setDate(todayStart.getDate() + (7 - todayStart.getDay()));

    const openTasks = tasks.filter((t) => !t.completed);
    const completedTasks = tasks.filter((t) => t.completed).slice(0, 20); // Show last 20 completed

    const todayTasks: Task[] = [];
    const thisWeekTasks: Task[] = [];
    const upcomingTasks: Task[] = [];

    openTasks.forEach((task) => {
      const dueDate = new Date(task.dueAt);
      dueDate.setHours(0, 0, 0, 0);

      if (dueDate.getTime() === todayStart.getTime() || task.priority === "high") {
        todayTasks.push(task);
      } else if (dueDate <= endOfWeek) {
        thisWeekTasks.push(task);
      } else {
        upcomingTasks.push(task);
      }
    });

    return {
      today: todayTasks,
      thisWeek: thisWeekTasks,
      upcoming: upcomingTasks,
      completed: completedTasks,
    };
  }, [tasks]);

  const handleTaskClick = (task: Task) => {
    setSelectedTask(task);
    setDetailPanelOpen(true);
  };

  const handleTaskUpdate = () => {
    setDetailPanelOpen(false);
    setSelectedTask(null);
    onTaskUpdate();
  };

  if (loading) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Loading tasks...</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Today Column */}
        <div className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center justify-between">
                <span>Today</span>
                <Badge variant="outline">{today.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 min-h-[400px]">
              {today.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No tasks due today
                </p>
              ) : (
                today.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onClick={() => handleTaskClick(task)}
                  />
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* This Week Column */}
        <div className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center justify-between">
                <span>This Week</span>
                <Badge variant="outline">{thisWeek.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 min-h-[400px]">
              {thisWeek.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No tasks this week
                </p>
              ) : (
                thisWeek.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onClick={() => handleTaskClick(task)}
                  />
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* Upcoming Column */}
        <div className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center justify-between">
                <span>Upcoming</span>
                <Badge variant="outline">{upcoming.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 min-h-[400px]">
              {upcoming.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No upcoming tasks
                </p>
              ) : (
                upcoming.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onClick={() => handleTaskClick(task)}
                  />
                ))
              )}
            </CardContent>
          </Card>
        </div>

        {/* Completed Column */}
        <div className="space-y-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium flex items-center justify-between">
                <span>Completed</span>
                <Badge variant="outline">{completed.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 min-h-[400px]">
              {completed.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No completed tasks
                </p>
              ) : (
                completed.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onClick={() => handleTaskClick(task)}
                  />
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {selectedTask && (
        <TaskDetailPanel
          task={selectedTask}
          open={detailPanelOpen}
          onOpenChange={setDetailPanelOpen}
          onTaskUpdate={handleTaskUpdate}
        />
      )}
    </>
  );
}





























































