// Block 25060 — SmartSend Roofing Task Manager v1
// THE ROOFING TASK SYSTEM — ZERO FLUFF.
// Task Manager UI with 4 tabs: My Tasks, Team Tasks, Job Tasks, Overdue Tasks

"use client";

import { useState, useEffect } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/button";
import { 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  User, 
  Briefcase, 
  AlertTriangle,
  Plus,
  Filter,
  Calendar,
  Building2,
  Users,
  FileText
} from "lucide-react";
import { format, formatDistanceToNow, isPast, isToday, isTomorrow } from "date-fns";
import { createClient } from "@/utils/supabase/client";

type TaskCategory = 'job_task' | 'lead_task' | 'owner_task' | 'system_task';
type TaskPriority = 'high' | 'medium' | 'low';
type TaskStatus = 'open' | 'in_progress' | 'done' | 'overdue';
type TaskCreationSource = 'manual' | 'auto' | 'message' | 'workflow' | 'alert' | 'nlp';

interface RoofingTask {
  id: string;
  workspace_id: string;
  category: TaskCategory;
  job_id: string | null;
  lead_id: string | null;
  contact_id: string | null;
  assigned_user_id: string | null;
  assigned_role: string | null;
  title: string;
  description: string | null;
  priority: TaskPriority;
  status: TaskStatus;
  due_date: string;
  due_time: string | null;
  due_at: string | null;
  completed_at: string | null;
  creation_source: TaskCreationSource;
  created_by: string | null;
  auto_source_details: Record<string, any>;
  created_at: string;
  updated_at: string;
  // Joined data
  job?: {
    id: string;
    title: string;
    job_value: number;
  } | null;
  lead?: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
  } | null;
  assigned_user?: {
    id: string;
    name: string;
    email: string;
  } | null;
}

interface TaskManagerProps {
  workspaceId: string;
  userId: string;
}

export function TaskManager({ workspaceId, userId }: TaskManagerProps) {
  const [activeTab, setActiveTab] = useState<'my-tasks' | 'team-tasks' | 'job-tasks' | 'overdue'>('my-tasks');
  const [tasks, setTasks] = useState<RoofingTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterPriority, setFilterPriority] = useState<TaskPriority | 'all'>('all');
  const [filterCategory, setFilterCategory] = useState<TaskCategory | 'all'>('all');
  const supabase = createClient();

  useEffect(() => {
    fetchTasks();
    
    // Subscribe to real-time updates
    const channel = supabase
      .channel(`task_manager_${workspaceId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "roofing_tasks",
          filter: `workspace_id=eq.${workspaceId}`,
        },
        () => {
          fetchTasks();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [workspaceId, activeTab, filterPriority, filterCategory]);

  const fetchTasks = async () => {
    try {
      setLoading(true);
      
      let query = supabase
        .from("roofing_tasks")
        .select(`
          *,
          job:roofing_jobs(id, title, job_value),
          lead:leads(id, email, first_name, last_name),
          assigned_user:profiles!roofing_tasks_assigned_user_id_fkey(id, name, email)
        `)
        .eq("workspace_id", workspaceId);

      // Apply filters based on active tab
      switch (activeTab) {
        case 'my-tasks':
          query = query.eq("assigned_user_id", userId).in("status", ["open", "in_progress", "overdue"]);
          break;
        case 'team-tasks':
          query = query.in("status", ["open", "in_progress", "overdue"]);
          break;
        case 'job-tasks':
          query = query.eq("category", "job_task").in("status", ["open", "in_progress", "overdue"]);
          break;
        case 'overdue':
          query = query.eq("status", "overdue");
          break;
      }

      // Apply priority filter
      if (filterPriority !== 'all') {
        query = query.eq("priority", filterPriority);
      }

      // Apply category filter
      if (filterCategory !== 'all') {
        query = query.eq("category", filterCategory);
      }

      // Order by priority and due date
      query = query.order("due_date", { ascending: true })
        .order("priority", { ascending: false });

      const { data, error } = await query;

      if (error) {
        console.error("Error fetching tasks:", error);
        return;
      }

      setTasks(data || []);
    } catch (error) {
      console.error("Error fetching tasks:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleTaskStatusChange = async (taskId: string, newStatus: TaskStatus) => {
    try {
      const updateData: any = { status: newStatus };
      
      if (newStatus === 'done') {
        updateData.completed_at = new Date().toISOString();
      } else if (newStatus === 'in_progress') {
        updateData.status = 'in_progress';
      }

      const { error } = await supabase
        .from("roofing_tasks")
        .update(updateData)
        .eq("id", taskId);

      if (error) {
        console.error("Error updating task:", error);
        return;
      }

      fetchTasks();
    } catch (error) {
      console.error("Error updating task:", error);
    }
  };

  const getPriorityColor = (priority: TaskPriority) => {
    switch (priority) {
      case 'high':
        return 'bg-red-500/10 text-red-400 border-red-500/20';
      case 'medium':
        return 'bg-orange-500/10 text-orange-400 border-orange-500/20';
      case 'low':
        return 'bg-green-500/10 text-green-400 border-green-500/20';
    }
  };

  const getPriorityIcon = (priority: TaskPriority) => {
    switch (priority) {
      case 'high':
        return '🔴';
      case 'medium':
        return '🟠';
      case 'low':
        return '🟢';
    }
  };

  const getCategoryIcon = (category: TaskCategory) => {
    switch (category) {
      case 'job_task':
        return <Briefcase className="h-4 w-4" />;
      case 'lead_task':
        return <User className="h-4 w-4" />;
      case 'owner_task':
        return <Building2 className="h-4 w-4" />;
      case 'system_task':
        return <FileText className="h-4 w-4" />;
    }
  };

  const getCreationSourceLabel = (source: TaskCreationSource) => {
    switch (source) {
      case 'manual':
        return 'Manual';
      case 'auto':
        return 'Auto';
      case 'message':
        return 'Message';
      case 'workflow':
        return 'Workflow';
      case 'alert':
        return 'Alert';
      case 'nlp':
        return 'NLP';
    }
  };

  const formatDueDate = (dueDate: string) => {
    const date = new Date(dueDate);
    if (isPast(date) && !isToday(date)) {
      return `Overdue ${formatDistanceToNow(date)}`;
    }
    if (isToday(date)) {
      return 'Due today';
    }
    if (isTomorrow(date)) {
      return 'Due tomorrow';
    }
    return `Due ${format(date, 'MMM d')}`;
  };

  const TaskCard = ({ task }: { task: RoofingTask }) => {
    const isOverdue = task.status === 'overdue' || (isPast(new Date(task.due_date)) && task.status !== 'done');
    
    return (
      <Card className={`bg-white/5 border-white/10 hover:bg-white/10 transition-colors ${
        isOverdue ? 'border-red-500/30 bg-red-500/5' : ''
      }`}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                {getCategoryIcon(task.category)}
                <h3 className="text-sm font-semibold text-white truncate">{task.title}</h3>
              </div>
              
              {task.description && (
                <p className="text-xs text-gray-400 mb-3 line-clamp-2">{task.description}</p>
              )}
              
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <Badge className={getPriorityColor(task.priority)}>
                  {getPriorityIcon(task.priority)} {task.priority}
                </Badge>
                
                {task.job && (
                  <Badge variant="outline" className="text-xs">
                    <Briefcase className="h-3 w-3 mr-1" />
                    {task.job.title}
                  </Badge>
                )}
                
                {task.lead && (
                  <Badge variant="outline" className="text-xs">
                    <User className="h-3 w-3 mr-1" />
                    {task.lead.first_name} {task.lead.last_name}
                  </Badge>
                )}
                
                {task.assigned_role && (
                  <Badge variant="outline" className="text-xs">
                    {task.assigned_role}
                  </Badge>
                )}
                
                <Badge variant="outline" className="text-xs">
                  {getCreationSourceLabel(task.creation_source)}
                </Badge>
              </div>
              
              <div className="flex items-center gap-4 text-xs text-gray-400">
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  <span className={isOverdue ? 'text-red-400 font-semibold' : ''}>
                    {formatDueDate(task.due_date)}
                  </span>
                </div>
                
                {task.assigned_user && (
                  <div className="flex items-center gap-1">
                    <User className="h-3 w-3" />
                    <span>{task.assigned_user.name || task.assigned_user.email}</span>
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex flex-col gap-2">
              {task.status !== 'done' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleTaskStatusChange(task.id, task.status === 'in_progress' ? 'open' : 'in_progress')}
                  className="text-xs"
                >
                  {task.status === 'in_progress' ? 'Mark Open' : 'Start'}
                </Button>
              )}
              
              <Button
                size="sm"
                variant={task.status === 'done' ? 'outline' : 'default'}
                onClick={() => handleTaskStatusChange(task.id, task.status === 'done' ? 'open' : 'done')}
                className="text-xs"
              >
                {task.status === 'done' ? (
                  <>
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Done
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Complete
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const taskCounts = {
    my: tasks.filter(t => t.assigned_user_id === userId && t.status !== 'done').length,
    team: tasks.filter(t => t.status !== 'done').length,
    job: tasks.filter(t => t.category === 'job_task' && t.status !== 'done').length,
    overdue: tasks.filter(t => t.status === 'overdue').length,
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center text-gray-400">Loading tasks...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Task Manager</h1>
          <p className="text-sm text-gray-400 mt-1">
            The to-do system for your entire roofing operation
          </p>
        </div>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          New Task
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="my-tasks" className="flex items-center gap-2">
            <User className="h-4 w-4" />
            My Tasks
            {taskCounts.my > 0 && (
              <Badge variant="outline" className="ml-1">{taskCounts.my}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="team-tasks" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Team Tasks
            {taskCounts.team > 0 && (
              <Badge variant="outline" className="ml-1">{taskCounts.team}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="job-tasks" className="flex items-center gap-2">
            <Briefcase className="h-4 w-4" />
            Job Tasks
            {taskCounts.job > 0 && (
              <Badge variant="outline" className="ml-1">{taskCounts.job}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="overdue" className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Overdue
            {taskCounts.overdue > 0 && (
              <Badge variant="outline" className="ml-1 bg-red-500/10 text-red-400 border-red-500/20">
                {taskCounts.overdue}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Filters */}
        <div className="mt-4 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-gray-400" />
            <select
              value={filterPriority}
              onChange={(e) => setFilterPriority(e.target.value as any)}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white"
            >
              <option value="all">All Priorities</option>
              <option value="high">🔴 High</option>
              <option value="medium">🟠 Medium</option>
              <option value="low">🟢 Low</option>
            </select>
          </div>
          
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value as any)}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white"
          >
            <option value="all">All Categories</option>
            <option value="job_task">Job Tasks</option>
            <option value="lead_task">Lead Tasks</option>
            <option value="owner_task">Owner Tasks</option>
            <option value="system_task">System Tasks</option>
          </select>
        </div>

        {/* Task Lists */}
        <TabsContent value="my-tasks" className="mt-6">
          <div className="space-y-3">
            {tasks.length === 0 ? (
              <Card className="bg-white/5 border-white/10">
                <CardContent className="p-8 text-center">
                  <CheckCircle2 className="h-12 w-12 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400">No tasks assigned to you</p>
                </CardContent>
              </Card>
            ) : (
              tasks.map((task) => <TaskCard key={task.id} task={task} />)
            )}
          </div>
        </TabsContent>

        <TabsContent value="team-tasks" className="mt-6">
          <div className="space-y-3">
            {tasks.length === 0 ? (
              <Card className="bg-white/5 border-white/10">
                <CardContent className="p-8 text-center">
                  <Users className="h-12 w-12 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400">No team tasks</p>
                </CardContent>
              </Card>
            ) : (
              tasks.map((task) => <TaskCard key={task.id} task={task} />)
            )}
          </div>
        </TabsContent>

        <TabsContent value="job-tasks" className="mt-6">
          <div className="space-y-3">
            {tasks.length === 0 ? (
              <Card className="bg-white/5 border-white/10">
                <CardContent className="p-8 text-center">
                  <Briefcase className="h-12 w-12 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400">No job tasks</p>
                </CardContent>
              </Card>
            ) : (
              tasks.map((task) => <TaskCard key={task.id} task={task} />)
            )}
          </div>
        </TabsContent>

        <TabsContent value="overdue" className="mt-6">
          <div className="space-y-3">
            {tasks.length === 0 ? (
              <Card className="bg-white/5 border-white/10">
                <CardContent className="p-8 text-center">
                  <AlertCircle className="h-12 w-12 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400">No overdue tasks</p>
                </CardContent>
              </Card>
            ) : (
              tasks.map((task) => <TaskCard key={task.id} task={task} />)
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

