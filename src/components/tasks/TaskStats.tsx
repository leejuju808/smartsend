"use client";

import { Card, CardContent } from "@/components/ui/card";
import type { Task } from "@/app/api/tasks/route";

interface TaskStatsProps {
  tasks: Task[];
}

export function TaskStats({ tasks }: TaskStatsProps) {
  const now = new Date();
  const today = new Date(now.setHours(0, 0, 0, 0));
  const endOfToday = new Date(now.setHours(23, 59, 59, 999));

  const openTasks = tasks.filter((t) => !t.completed);
  const dueToday = openTasks.filter((t) => {
    const due = new Date(t.dueAt);
    return due >= today && due <= endOfToday;
  });
  const overdue = openTasks.filter((t) => {
    const due = new Date(t.dueAt);
    return due < today;
  });
  const assignedToMe = openTasks.filter((t) => {
    // This will be filtered client-side based on current user
    return true; // Will be filtered properly when we have user context
  });
  const completedLast7Days = tasks.filter((t) => {
    if (!t.completedAt) return false;
    const completed = new Date(t.completedAt);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    return completed >= sevenDaysAgo;
  });

  const stats = [
    { label: "Open Tasks", value: openTasks.length, color: "text-blue-500" },
    { label: "Due Today", value: dueToday.length, color: "text-orange-500" },
    { label: "Overdue", value: overdue.length, color: "text-red-500" },
    { label: "Assigned to Me", value: assignedToMe.length, color: "text-green-500" },
    { label: "Completed (7d)", value: completedLast7Days.length, color: "text-gray-500" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      {stats.map((stat) => (
        <Card key={stat.label}>
          <CardContent className="p-4">
            <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
            <div className="text-sm text-muted-foreground mt-1">{stat.label}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}





























































