'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';

type Task = {
  id: string;
  title: string;
  type: string;
  status: string;
  due_at: string | null;
  created_at: string;
  lead: {
    email: string;
    first_name: string | null;
    last_name: string | null;
  } | null;
  campaign: {
    name: string;
  } | null;
  thread: {
    subject: string | null;
  } | null;
};

export default function TasksCard() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTasks();
  }, []);

  async function loadTasks() {
    setLoading(true);
    try {
      const res = await fetch('/api/tasks?status=open');
      if (res.ok) {
        const data = await res.json();
        setTasks(data);
      }
    } catch (error) {
      console.error('Failed to load tasks:', error);
    } finally {
      setLoading(false);
    }
  }

  async function markDone(id: string) {
    const res = await fetch('/api/tasks', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: 'done' }),
    });
    if (res.ok) {
      setTasks(tasks.filter(t => t.id !== id));
    }
  }

  if (loading) {
    return <div className="p-4 text-sm text-muted-foreground">Loading tasks...</div>;
  }

  if (tasks.length === 0) {
    return (
      <div className="rounded-2xl border p-6">
        <h3 className="font-semibold mb-2">Tasks</h3>
        <p className="text-sm text-muted-foreground">No open tasks</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border overflow-hidden">
      <div className="p-4 border-b bg-muted/50">
        <h3 className="font-semibold">Tasks ({tasks.length})</h3>
      </div>
      <div className="divide-y">
        {tasks.map(task => (
          <div key={task.id} className="p-4 hover:bg-muted/30 transition-colors">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">{task.title}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  {task.lead ? `${task.lead.first_name || ''} ${task.lead.last_name || ''}`.trim() || task.lead.email : 'Unknown lead'}
                  {task.campaign && ` · ${task.campaign.name}`}
                </div>
                {task.due_at && (
                  <div className="text-xs text-muted-foreground mt-1">
                    Due: {new Date(task.due_at).toLocaleString()}
                  </div>
                )}
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => markDone(task.id)}
                className="flex-shrink-0"
              >
                Done
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


