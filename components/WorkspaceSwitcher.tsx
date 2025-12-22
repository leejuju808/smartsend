"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

type WS = { id: string; name: string; role: "owner"|"admin"|"member" };

export default function WorkspaceSwitcher({ current }: { current?: string }) {
  const [open, setOpen] = React.useState(false);
  const [ws, setWs] = React.useState<WS[]>([]);
  const [newName, setNewName] = React.useState("");
  const [active, setActive] = React.useState<string | null>(current ?? null);

  React.useEffect(() => {
    (async () => {
      const res = await fetch("/api/workspaces/list");
      if (res.ok) setWs(await res.json());
    })();
  }, []);

  const switchTo = async (id: string) => {
    const r = await fetch("/api/workspaces/switch", {
      method: "POST", headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ workspaceId: id })
    });
    if (!r.ok) return toast.error(await r.text());
    setActive(id); setOpen(false);
    toast.success("Workspace switched");
    window.location.reload();
  };

  const createWs = async () => {
    if (!newName.trim()) return;
    const r = await fetch("/api/workspaces/create", {
      method: "POST", headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ name: newName.trim() })
    });
    if (!r.ok) return toast.error(await r.text());
    const j = await r.json();
    setWs([{ id: j.id, name: newName.trim(), role: "owner" }, ...ws]);
    setNewName(""); setActive(j.id); setOpen(false);
    toast.success("Workspace created");
    window.location.reload();
  };

  const label = ws.find(x => x.id === active)?.name ?? "Select workspace";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="truncate max-w-[220px]">{label}</Button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="text-sm font-medium mb-2">Workspaces</div>
        <div className="max-h-56 overflow-auto">
          {ws.map(item => (
            <button
              key={item.id}
              className={`w-full text-left px-2 py-1.5 rounded hover:bg-muted ${active===item.id?"bg-muted":""}`}
              onClick={() => switchTo(item.id)}
            >
              <div className="flex items-center justify-between">
                <span className="truncate">{item.name}</span>
                <span className="text-xs text-muted-foreground">{item.role}</span>
              </div>
            </button>
          ))}
          {!ws.length && <div className="text-sm text-muted-foreground">No workspaces yet.</div>}
        </div>
        <Separator className="my-3" />
        <div className="text-sm font-medium mb-2">Create new</div>
        <div className="flex gap-2">
          <Input placeholder="e.g. Sales Team" value={newName} onChange={e=>setNewName(e.target.value)} />
          <Button size="sm" onClick={createWs}>Create</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
