"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

export function TasksWidget({ ownerId }: { ownerId?: string }) {
  const [rows, setRows] = React.useState<any[]>([]);
  const load = async () => {
    const url = new URL("/api/tasks/list", window.location.origin);
    if (ownerId) url.searchParams.set("ownerId", ownerId);
    url.searchParams.set("status", "open");
    const res = await fetch(url.toString(), { cache: "no-store" });
    const j = await res.json();
    setRows(j.rows ?? []);
  };
  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleDone = async (id: string, done: boolean) => {
    await fetch("/api/tasks/update", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, status: done ? "done" : "open" }),
    });
    load();
  };

  return (
    <div className="rounded-2xl border">
      <div className="border-b p-3 text-sm font-medium">Follow-up Tasks</div>
      <div className="divide-y">
        {rows.length === 0 ? (
          <div className="p-3 text-sm text-muted-foreground">No open tasks.</div>
        ) : (
          rows.map((t) => {
            const name =
              t.leads?.first_name || t.leads?.last_name
                ? `${t.leads?.first_name ?? ""} ${t.leads?.last_name ?? ""}`.trim()
                : t.leads?.email;
            return (
              <div key={t.id} className="flex items-center justify-between p-3 text-sm">
                <div className="min-w-0">
                  <div className="truncate">{t.title}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {name} {t.leads?.company ? `• ${t.leads.company}` : ""} • due {new Date(t.due_at ?? t.created_at).toLocaleString()}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <a className="text-xs underline" href={`mailto:${t.leads?.email ?? ""}`}>Email</a>
                  <Checkbox onCheckedChange={(v: boolean) => toggleDone(t.id, !!v)} />
                </div>
              </div>
            );
          })
        )}
      </div>
      <div className="p-2 text-right">
        <Button variant="outline" size="sm" onClick={load}>
          Refresh
        </Button>
      </div>
    </div>
  );
}


