// Block 25060 — SmartSend Roofing Task Manager v1
// Component to display tasks in Job Timeline

"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { Badge } from "@/components/ui/Badge";
import { CheckCircle2, Clock, AlertTriangle, Briefcase, User, Building2, FileText } from "lucide-react";
import { format, formatDistanceToNow, isPast } from "date-fns";
import Link from "next/link";

interface TasksInTimelineProps {
  jobId?: string | null;
  leadId?: string | null;
}

interface Task {
  id: string;
  title: string;
  description: string | null;
  category: 'job_task' | 'lead_task' | 'owner_task' | 'system_task';
  priority: 'high' | 'medium' | 'low';
  status: 'open' | 'in_progress' | 'done' | 'overdue';
  due_date: string;
  assigned_role: string | null;
  creation_source: string;
}

export function TasksInTimeline({ jobId, leadId }: TasksInTimelineProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    fetchTasks();
    
    // Subscribe to real-time updates
    const channel = supabase
      .channel(`tasks_timeline_${jobId || leadId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "roofing_tasks",
          filter: jobId ? `job_id=eq.${jobId}` : `lead_id=eq.${leadId}`,
        },
        () => {
          fetchTasks();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [jobId, leadId]);

  const fetchTasks = async () => {
    try {
      setLoading(true);
      
      let query = supabase
        .from("roofing_tasks")
        .select("*")
        .in("status", ["open", "in_progress", "overdue"])
        .order("due_date", { ascending: true })
        .order("priority", { ascending: false });

      if (jobId) {
        query = query.eq("job_id", jobId);
      } else if (leadId) {
        query = query.eq("lead_id", leadId);
      } else {
        setTasks([]);
        setLoading(false);
        return;
      }

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

  const getPriorityColor = (priority: 'high' | 'medium' | 'low') => {
    switch (priority) {
      case 'high':
        return 'bg-red-500/10 text-red-400 border-red-500/20';
      case 'medium':
        return 'bg-orange-500/10 text-orange-400 border-orange-500/20';
      case 'low':
        return 'bg-green-500/10 text-green-400 border-green-500/20';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'job_task':
        return <Briefcase className="h-3 w-3" />;
      case 'lead_task':
        return <User className="h-3 w-3" />;
      case 'owner_task':
        return <Building2 className="h-3 w-3" />;
      case 'system_task':
        return <FileText className="h-3 w-3" />;
    }
  };

  if (loading) {
    return null;
  }

  if (tasks.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2 mt-4">
      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
        Active Tasks
      </h4>
      {tasks.map((task) => {
        const isOverdue = task.status === 'overdue' || (isPast(new Date(task.due_date)) && task.status !== 'done');
        
        return (
          <Link
            key={task.id}
            href={`/tasks?task=${task.id}`}
            className="block p-3 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {getCategoryIcon(task.category)}
                  <span className="text-sm font-medium text-white truncate">
                    {task.title}
                  </span>
                </div>
                
                <div className="flex items-center gap-2 mt-2">
                  <Badge className={getPriorityColor(task.priority)}>
                    {task.priority === 'high' ? '🔴' : task.priority === 'medium' ? '🟠' : '🟢'} {task.priority}
                  </Badge>
                  
                  {isOverdue && (
                    <Badge className="bg-red-500/10 text-red-400 border-red-500/20">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      Overdue
                    </Badge>
                  )}
                  
                  {task.status === 'in_progress' && (
                    <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20">
                      <Clock className="h-3 w-3 mr-1" />
                      In Progress
                    </Badge>
                  )}
                  
                  <span className="text-xs text-gray-400">
                    Due {format(new Date(task.due_date), 'MMM d')}
                  </span>
                </div>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

