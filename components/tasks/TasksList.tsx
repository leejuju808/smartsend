"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/Badge";

export function TasksList() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/tasks?status=open");
      const json = await res.json();
      setTasks(json.tasks || []);
    } catch (error) {
      console.error("Failed to load tasks:", error);
      setTasks([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const complete = async (id: string) => {
    try {
      await fetch(`/api/tasks/${id}/done`, { method: "POST" });
      await load();
    } catch (error) {
      console.error("Failed to complete task:", error);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Tasks</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        {loading ? (
          <div className="text-muted-foreground">Loading…</div>
        ) : tasks.length === 0 ? (
          <div className="text-muted-foreground">No open tasks</div>
        ) : (
          tasks.map((t) => (
            <div
              key={t.id}
              className="p-2 border rounded-md bg-slate-950/60 space-y-1"
            >
              <div className="flex justify-between items-center">
                <span className="font-semibold">{t.title}</span>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => complete(t.id)}
                >
                  Done
                </Button>
              </div>

              <div className="text-[11px] text-muted-foreground">
                {t.leads?.email}
                {t.campaigns?.name && ` · ${t.campaigns.name}`}
              </div>

              {t.due_at && (
                <Badge className="text-[10px]">
                  Due {new Date(t.due_at).toLocaleDateString()}
                </Badge>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}






