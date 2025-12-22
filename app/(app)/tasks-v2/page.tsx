// Block 16200 — SmartSend Tasks & Follow-Up Board v1
// The Roofing Task System: Auto-Created Tasks, Urgency Ranking, Follow-Up Cycles, Pipeline Actions & Daily Workflows

"use client";

import { useEffect, useState } from "react";
import { TaskV2, TaskType, TaskUrgency, TaskStatus } from "@/app/api/tasks/v2/route";
import { 
  CheckCircle2, 
  Circle, 
  AlertCircle, 
  Clock, 
  Phone, 
  Mail, 
  Calendar, 
  TrendingUp,
  MessageSquare,
  FileText,
  AlertTriangle,
  Flame,
  Filter,
  Plus,
  Search,
  ChevronRight
} from "lucide-react";
import { format, isToday, isTomorrow, isPast, isFuture } from "date-fns";

const TASK_TYPE_LABELS: Record<TaskType, string> = {
  follow_up_needed: "Follow-Up Needed",
  book_inspection: "Book Inspection",
  answer_question: "Answer Question",
  update_lead_info: "Update Lead Info",
  high_urgency_issue: "High Urgency Issue",
};

const TASK_TYPE_ICONS: Record<TaskType, typeof Phone> = {
  follow_up_needed: Clock,
  book_inspection: Calendar,
  answer_question: MessageSquare,
  update_lead_info: FileText,
  high_urgency_issue: AlertTriangle,
};

const URGENCY_COLORS: Record<TaskUrgency, string> = {
  high: "text-red-600 bg-red-50 border-red-200",
  normal: "text-yellow-600 bg-yellow-50 border-yellow-200",
  low: "text-blue-600 bg-blue-50 border-blue-200",
};

const URGENCY_EMOJIS: Record<TaskUrgency, string> = {
  high: "🔥",
  normal: "🟡",
  low: "🟦",
};

export default function TasksBoardV2Page() {
  const [tasks, setTasks] = useState<TaskV2[]>([]);
  const [grouped, setGrouped] = useState<{
    today: TaskV2[];
    upcoming: TaskV2[];
    waiting_on_homeowner: TaskV2[];
    completed: TaskV2[];
  }>({
    today: [],
    upcoming: [],
    waiting_on_homeowner: [],
    completed: [],
  });
  const [stats, setStats] = useState({
    today: 0,
    upcoming: 0,
    waiting: 0,
    completed: 0,
    overdue: 0,
    highUrgency: 0,
  });
  const [loading, setLoading] = useState(true);
  const [filterUrgency, setFilterUrgency] = useState<TaskUrgency | "all">("all");
  const [filterType, setFilterType] = useState<TaskType | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    loadTasks();
    // Refresh every 60 seconds
    const interval = setInterval(loadTasks, 60000);
    return () => clearInterval(interval);
  }, [filterUrgency, filterType]);

  async function loadTasks() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterUrgency !== "all") {
        params.set("urgency", filterUrgency);
      }
      if (filterType !== "all") {
        params.set("taskType", filterType);
      }

      const res = await fetch(`/api/tasks/v2?${params.toString()}`);
      const json = await res.json();

      if (json.data) {
        let filteredTasks = json.data as TaskV2[];

        // Apply search filter
        if (searchQuery) {
          filteredTasks = filteredTasks.filter(
            (task) =>
              task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
              task.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
              task.lastMessageSnippet?.toLowerCase().includes(searchQuery.toLowerCase())
          );
        }

        setTasks(filteredTasks);
        setGrouped(json.grouped || {
          today: [],
          upcoming: [],
          waiting_on_homeowner: [],
          completed: [],
        });
        setStats(json.stats || stats);
      }
    } catch (error) {
      console.error("Error loading tasks:", error);
    } finally {
      setLoading(false);
    }
  }

  const handleCompleteTask = async (taskId: string) => {
    try {
      const res = await fetch(`/api/tasks/v2/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: true }),
      });

      if (res.ok) {
        loadTasks();
      }
    } catch (error) {
      console.error("Error completing task:", error);
    }
  };

  const handleUpdateStatus = async (taskId: string, newStatus: TaskStatus) => {
    try {
      const res = await fetch(`/api/tasks/v2/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (res.ok) {
        loadTasks();
      }
    } catch (error) {
      console.error("Error updating task status:", error);
    }
  };

  const TaskCard = ({ task }: { task: TaskV2 }) => {
    const Icon = TASK_TYPE_ICONS[task.taskType];
    const urgencyColor = URGENCY_COLORS[task.urgency];
    const urgencyEmoji = URGENCY_EMOJIS[task.urgency];
    const isOverdue = isPast(new Date(task.dueAt)) && !task.completed;

    return (
      <div
        className={`border rounded-lg p-3 bg-white hover:shadow-md transition-shadow cursor-move ${
          isOverdue ? "border-red-300 bg-red-50" : "border-gray-200"
        }`}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData("taskId", task.id);
        }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Icon className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
              <span className={`text-xs font-medium px-1.5 py-0.5 rounded border ${urgencyColor}`}>
                {urgencyEmoji} {task.urgency}
              </span>
              {task.autoGenerated && (
                <span className="text-xs text-gray-400">Auto</span>
              )}
            </div>
            <p className="text-sm text-gray-900 font-medium mb-1 line-clamp-2">
              {task.title}
            </p>
            {task.description && (
              <p className="text-xs text-gray-500 mb-1 line-clamp-2">{task.description}</p>
            )}
            {task.lastMessageSnippet && (
              <p className="text-xs text-gray-400 italic mb-1 line-clamp-1">
                "{task.lastMessageSnippet}"
              </p>
            )}
            {task.nextStepSuggestion && (
              <div className="text-xs text-blue-600 mb-1 flex items-center gap-1">
                <ChevronRight className="h-3 w-3" />
                {task.nextStepSuggestion}
              </div>
            )}
            <div className="flex items-center gap-3 text-xs text-gray-500 mt-2">
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <span className={isOverdue ? "text-red-600 font-medium" : ""}>
                  {format(new Date(task.dueAt), "MMM d, h:mm a")}
                </span>
              </div>
              {task.metadata?.storm_risk && (
                <span className="text-orange-600">🌪️ Storm Risk</span>
              )}
              {task.metadata?.insurance_claim && (
                <span className="text-blue-600">🏠 Insurance</span>
              )}
            </div>
          </div>
          <button
            onClick={() => handleCompleteTask(task.id)}
            className="flex-shrink-0 p-1 hover:bg-gray-100 rounded"
            title="Mark as complete"
          >
            {task.completed ? (
              <CheckCircle2 className="h-4 w-4 text-green-600" />
            ) : (
              <Circle className="h-4 w-4 text-gray-400 hover:text-green-600" />
            )}
          </button>
        </div>
        <div className="flex gap-1 mt-2 pt-2 border-t border-gray-100">
          <button
            onClick={() => window.open(`/contacts/${task.contactId}`, "_blank")}
            className="text-xs text-blue-600 hover:underline"
          >
            View Contact
          </button>
          {task.replyThreadId && (
            <button
              onClick={() => window.open(`/inbox/${task.replyThreadId}`, "_blank")}
              className="text-xs text-blue-600 hover:underline"
            >
              View Thread
            </button>
          )}
        </div>
      </div>
    );
  };

  const TaskColumn = ({ 
    title, 
    tasks, 
    color, 
    status 
  }: { 
    title: string; 
    tasks: TaskV2[]; 
    color: string;
    status: TaskStatus;
  }) => (
    <div className="flex-1 min-w-0 flex flex-col">
      <div className={`${color} p-3 rounded-t-lg border`}>
        <h3 className="font-semibold text-sm text-gray-900">{title}</h3>
        <p className="text-xs text-gray-600 mt-0.5">{tasks.length} {tasks.length === 1 ? "task" : "tasks"}</p>
      </div>
      <div
        className="flex-1 overflow-y-auto p-3 space-y-2 bg-gray-50 rounded-b-lg border border-t-0 min-h-[400px]"
        onDrop={(e) => {
          e.preventDefault();
          const taskId = e.dataTransfer.getData("taskId");
          if (taskId) {
            handleUpdateStatus(taskId, status);
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
        }}
      >
        {tasks.length === 0 ? (
          <div className="text-xs text-gray-400 text-center py-8">No tasks</div>
        ) : (
          tasks.map((task) => <TaskCard key={task.id} task={task} />)
        )}
      </div>
    </div>
  );

  if (loading && tasks.length === 0) {
    return (
      <div className="h-[calc(100vh-64px)] flex items-center justify-center">
        <div className="text-gray-500">Loading tasks...</div>
      </div>
    );
  }

  const totalTasks = stats.today + stats.upcoming + stats.waiting;

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col bg-gray-50">
      {/* Header */}
      <div className="border-b bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Tasks & Follow-Up Board</h1>
            <p className="text-sm text-gray-500 mt-1">
              {totalTasks} {totalTasks === 1 ? "task" : "tasks"} • {stats.overdue} overdue • {stats.highUrgency} high urgency
            </p>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            <Plus className="h-4 w-4" />
            New Task
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search tasks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={filterUrgency}
              onChange={(e) => setFilterUrgency(e.target.value as TaskUrgency | "all")}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Urgency</option>
              <option value="high">🔥 High</option>
              <option value="normal">🟡 Normal</option>
              <option value="low">🟦 Low</option>
            </select>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as TaskType | "all")}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Types</option>
              {Object.entries(TASK_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Task Board */}
      <div className="flex-1 overflow-x-auto p-4">
        <div className="flex gap-4 h-full min-w-max">
          <TaskColumn
            title="Today"
            tasks={grouped.today}
            color="bg-orange-100 border-orange-200"
            status="today"
          />
          <TaskColumn
            title="Upcoming"
            tasks={grouped.upcoming}
            color="bg-blue-100 border-blue-200"
            status="upcoming"
          />
          <TaskColumn
            title="Waiting on Homeowner"
            tasks={grouped.waiting_on_homeowner}
            color="bg-yellow-100 border-yellow-200"
            status="waiting_on_homeowner"
          />
          <TaskColumn
            title="Completed"
            tasks={grouped.completed}
            color="bg-green-100 border-green-200"
            status="completed"
          />
        </div>
      </div>
    </div>
  );
}





















































