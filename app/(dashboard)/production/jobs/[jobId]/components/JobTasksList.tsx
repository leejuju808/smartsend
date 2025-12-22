"use client";

import { useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckSquare, Plus, Clock } from "lucide-react";
import { format } from "date-fns";

interface JobTasksListProps {
  jobId: string;
  tasks: Array<{
    id: string;
    description: string;
    due_at: string | null;
    completed: boolean;
    completed_at: string | null;
  }>;
}

export function JobTasksList({ jobId, tasks: initialTasks }: JobTasksListProps) {
  const supabase = createClientComponentClient();
  const [tasks, setTasks] = useState(initialTasks);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    description: '',
    due_at: '',
  });

  const handleAddTask = async () => {
    try {
      const { data, error } = await supabase
        .from('job_tasks')
        .insert({
          job_id: jobId,
          description: formData.description,
          due_at: formData.due_at || null,
        })
        .select()
        .single();

      if (error) throw error;

      setTasks([...tasks, data]);
      setFormData({ description: '', due_at: '' });
      setShowForm(false);
    } catch (error) {
      console.error('Error adding task:', error);
      alert('Failed to add task. Please try again.');
    }
  };

  const handleToggleComplete = async (taskId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('job_tasks')
        .update({
          completed: !currentStatus,
          completed_at: !currentStatus ? new Date().toISOString() : null,
        })
        .eq('id', taskId);

      if (error) throw error;

      setTasks(tasks.map(t =>
        t.id === taskId
          ? { ...t, completed: !currentStatus, completed_at: !currentStatus ? new Date().toISOString() : null }
          : t
      ));
    } catch (error) {
      console.error('Error updating task:', error);
      alert('Failed to update task. Please try again.');
    }
  };

  const pendingTasks = tasks.filter(t => !t.completed);
  const completedTasks = tasks.filter(t => t.completed);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <CheckSquare className="h-5 w-5" />
            Production Tasks
          </CardTitle>
          <Button onClick={() => setShowForm(!showForm)} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add Task
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {showForm && (
          <div className="p-4 border rounded-lg space-y-3">
            <input
              type="text"
              placeholder="Task description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 border rounded-md text-sm"
            />
            <input
              type="datetime-local"
              placeholder="Due date"
              value={formData.due_at}
              onChange={(e) => setFormData({ ...formData, due_at: e.target.value })}
              className="w-full px-3 py-2 border rounded-md text-sm"
            />
            <div className="flex gap-2">
              <Button onClick={handleAddTask} size="sm">Add</Button>
              <Button onClick={() => setShowForm(false)} variant="outline" size="sm">Cancel</Button>
            </div>
          </div>
        )}

        {pendingTasks.length > 0 && (
          <div>
            <h3 className="text-sm font-medium mb-2">Pending</h3>
            <div className="space-y-2">
              {pendingTasks.map((task) => (
                <div
                  key={task.id}
                  className="p-3 border rounded-lg flex items-start justify-between"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={task.completed}
                        onChange={() => handleToggleComplete(task.id, task.completed)}
                        className="rounded"
                      />
                      <p className="font-medium">{task.description}</p>
                    </div>
                    {task.due_at && (
                      <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>Due: {format(new Date(task.due_at), 'MMM d, yyyy h:mm a')}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {completedTasks.length > 0 && (
          <div>
            <h3 className="text-sm font-medium mb-2 text-muted-foreground">Completed</h3>
            <div className="space-y-2">
              {completedTasks.map((task) => (
                <div
                  key={task.id}
                  className="p-3 border rounded-lg flex items-start justify-between opacity-60"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={task.completed}
                        onChange={() => handleToggleComplete(task.id, task.completed)}
                        className="rounded"
                      />
                      <p className="font-medium line-through">{task.description}</p>
                    </div>
                    {task.completed_at && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Completed: {format(new Date(task.completed_at), 'MMM d, yyyy')}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tasks.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No tasks yet. Tasks are auto-created when jobs move to certain stages.
          </p>
        )}
      </CardContent>
    </Card>
  );
}


































