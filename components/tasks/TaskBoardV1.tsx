// Block 16200 — SmartSend Tasks & Follow-Up Board v1
// The Roofing Task System: Auto-Created Tasks, Urgency Ranking, Follow-Up Cycles, Pipeline Actions & Daily Workflows

"use client";

import { useEffect, useState } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/src/components/ui/skeleton";
import { TaskCard } from "./TaskCard";
import { 
  CalendarIcon, 
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ClockIcon 
} from "@heroicons/react/24/outline";

type TaskStatus = "today" | "upcoming" | "waiting_on_homeowner" | "completed";
type TaskType = "follow_up_needed" | "book_inspection" | "answer_question" | "update_lead_info" | "high_urgency_issue";
type UrgencyLevel = "high" | "normal" | "low";

type Task = {
  id: string;
  workspace_id: string;
  user_id: string | null;
  contact_id: string | null;
  task_type: TaskType;
  urgency: UrgencyLevel;
  status: TaskStatus;
  title: string;
  description: string | null;
  notes: string | null;
  due_at: string;
  completed_at: string | null;
  metadata: {
    reply_intent?: string;
    storm_risk?: number;
    insurance_likelihood?: number;
    last_message_snippet?: string;
    [key: string]: any;
  };
  auto_generated: boolean;
  auto_source: string | null;
  pipeline_stage_id: string | null;
  suggested_next_stage: string | null;
  created_at: string;
  updated_at: string;
  contacts?: {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
  } | null;
  pipeline_stages?: {
    id: string;
    key: string;
    label: string;
  } | null;
};

type TaskBoardData = {
  today: Task[];
  upcoming: Task[];
  waiting_on_homeowner: Task[];
  completed: Task[];
};

const STATUS_CONFIG: Record<TaskStatus, { 
  label: string; 
  icon: any;
  color: string; 
  bgColor: string;
  description: string;
}> = {
  today: { 
    label: "Today", 
    icon: CalendarIcon,
    color: "text-red-600", 
    bgColor: "bg-red-50 border-red-200",
    description: "Due today"
  },
  upcoming: { 
    label: "Upcoming", 
    icon: ClockIcon,
    color: "text-blue-600", 
    bgColor: "bg-blue-50 border-blue-200",
    description: "Scheduled for later"
  },
  waiting_on_homeowner: { 
    label: "Waiting on Homeowner", 
    icon: ClockIcon,
    color: "text-yellow-600", 
    bgColor: "bg-yellow-50 border-yellow-200",
    description: "Awaiting response"
  },
  completed: { 
    label: "Completed", 
    icon: CheckCircleIcon,
    color: "text-green-600", 
    bgColor: "bg-green-50 border-green-200",
    description: "Finished tasks"
  },
};

export function TaskBoardV1() {
  const [tasks, setTasks] = useState<TaskBoardData>({
    today: [],
    upcoming: [],
    waiting_on_homeowner: [],
    completed: [],
  });
  const [loading, setLoading] = useState(true);
  const [todayCount, setTodayCount] = useState(0);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  useEffect(() => {
    loadTasks();
    
    // Refresh every 30 seconds
    const interval = setInterval(() => {
      loadTasks();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  async function loadTasks() {
    try {
      const res = await fetch("/api/tasks/v1?status=all&limit=500");
      if (!res.ok) throw new Error("Failed to load tasks");
      const data = await res.json();
      
      // Group tasks by status
      const grouped: TaskBoardData = {
        today: [],
        upcoming: [],
        waiting_on_homeowner: [],
        completed: [],
      };

      (data.tasks || []).forEach((task: Task) => {
        if (task.status in grouped) {
          grouped[task.status as TaskStatus].push(task);
        }
      });

      // Sort tasks within each column
      Object.keys(grouped).forEach((status) => {
        grouped[status as TaskStatus].sort((a, b) => {
          // Sort by urgency first (high > normal > low), then by due_at
          const urgencyOrder = { high: 3, normal: 2, low: 1 };
          const urgencyDiff = urgencyOrder[b.urgency] - urgencyOrder[a.urgency];
          if (urgencyDiff !== 0) return urgencyDiff;
          return new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
        });
      });

      setTasks(grouped);
      setTodayCount(data.todayCount || 0);
      setLoading(false);
    } catch (error) {
      console.error("Failed to load tasks:", error);
      setLoading(false);
    }
  }

  async function handleDragEnd(result: DropResult) {
    if (!result.destination) return;
    
    const { source, destination, draggableId } = result;
    
    // Don't do anything if dropped in the same place
    if (source.droppableId === destination.droppableId) return;

    const sourceStatus = source.droppableId as TaskStatus;
    const destStatus = destination.droppableId as TaskStatus;

    // Find the task being moved
    const task = tasks[sourceStatus].find((t) => t.id === draggableId);
    if (!task) return;

    // Optimistically update UI
    const updatedTasks = { ...tasks };
    updatedTasks[sourceStatus] = updatedTasks[sourceStatus].filter(
      (t) => t.id !== draggableId
    );
    updatedTasks[destStatus] = [
      ...updatedTasks[destStatus],
      { ...task, status: destStatus },
    ];
    setTasks(updatedTasks);

    // Update on server
    try {
      const res = await fetch(`/api/tasks/v1/${draggableId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: destStatus }),
      });

      if (!res.ok) {
        // Revert on error
        setTasks(tasks);
        throw new Error("Failed to update task");
      }
    } catch (error) {
      console.error("Failed to update task:", error);
      // Revert on error
      setTasks(tasks);
    }
  }

  async function handleCompleteTask(taskId: string) {
    try {
      const res = await fetch(`/api/tasks/v1/${taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });

      if (res.ok) {
        loadTasks();
      }
    } catch (error) {
      console.error("Failed to complete task:", error);
    }
  }

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-96" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Tasks & Follow-Up Board</h1>
          <p className="text-muted-foreground mt-1">
            Your daily operational system — know exactly what to do and when
          </p>
        </div>
        <div className="flex items-center gap-4">
          {todayCount > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 bg-red-50 border border-red-200 rounded-lg">
              <ExclamationTriangleIcon className="h-5 w-5 text-red-600" />
              <span className="font-semibold text-red-600">
                {todayCount} tasks due today
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Task Board */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-4 gap-4">
          {Object.entries(STATUS_CONFIG).map(([status, config]) => {
            const statusKey = status as TaskStatus;
            const columnTasks = tasks[statusKey];
            const StatusIcon = config.icon;

            return (
              <div key={status} className="flex flex-col">
                <Card className={`${config.bgColor} border-2`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <StatusIcon className={`h-5 w-5 ${config.color}`} />
                        <h2 className={`font-semibold ${config.color}`}>
                          {config.label}
                        </h2>
                      </div>
                      <Badge variant="outline" className={config.color}>
                        {columnTasks.length}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mb-4">
                      {config.description}
                    </p>

                    <Droppable droppableId={status}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={`min-h-[400px] space-y-2 ${
                            snapshot.isDraggingOver ? "bg-opacity-50" : ""
                          }`}
                        >
                          {columnTasks.length === 0 ? (
                            <div className="text-center text-sm text-muted-foreground py-8">
                              No tasks
                            </div>
                          ) : (
                            columnTasks.map((task, index) => (
                              <Draggable
                                key={task.id}
                                draggableId={task.id}
                                index={index}
                              >
                                {(provided, snapshot) => (
                                  <div
                                    ref={provided.innerRef}
                                    {...provided.draggableProps}
                                    {...provided.dragHandleProps}
                                    className={`${
                                      snapshot.isDragging
                                        ? "opacity-50"
                                        : ""
                                    }`}
                                  >
                                    <TaskCard
                                      task={task}
                                      onComplete={() => handleCompleteTask(task.id)}
                                      onClick={() => setSelectedTask(task)}
                                    />
                                  </div>
                                )}
                              </Draggable>
                            ))
                          )}
                          {provided.placeholder}
                        </div>
                      )}
                    </Droppable>
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>
      </DragDropContext>

      {/* Task Detail Modal/Drawer would go here */}
      {selectedTask && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-semibold">{selectedTask.title}</h3>
                <Button
                  variant="ghost"
                  onClick={() => setSelectedTask(null)}
                >
                  Close
                </Button>
              </div>
              {/* Task details would go here */}
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-muted-foreground">Type</p>
                  <p className="font-medium">{selectedTask.task_type}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Urgency</p>
                  <Badge>{selectedTask.urgency}</Badge>
                </div>
                {selectedTask.description && (
                  <div>
                    <p className="text-sm text-muted-foreground">Description</p>
                    <p>{selectedTask.description}</p>
                  </div>
                )}
                {selectedTask.contacts && (
                  <div>
                    <p className="text-sm text-muted-foreground">Homeowner</p>
                    <p>
                      {selectedTask.contacts.first_name} {selectedTask.contacts.last_name}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {selectedTask.contacts.email}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}





















































