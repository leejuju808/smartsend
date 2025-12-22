"use client";
import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ReplyState } from "./ReplyState";
import { LeadStatusBadge } from "@/components/leads/LeadStatusBadge";

type Row = {
  thread_id: string;
  subject: string | null;
  lead_email: string | null;
  lead_name: string | null;
  lead_id?: string | null;
  company: string | null;
  last_message_at: string;
  unread_count: number;
  replied: boolean;
  last_body: string | null;
  lead_status?: {
    status: string | null;
  } | null;
};

export function ThreadList({ onOpen }: { onOpen: (threadId: string) => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all"|"unread"|"replied"|"awaiting">("all");
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  async function load() {
    try {
      const r = await fetch(`/api/inbox/threads-new?q=${encodeURIComponent(q)}&filter=${filter}`);
      const j = await r.json();
      setRows(j.data || []);
    } catch (error) {
      console.error("Failed to load threads:", error);
      setRows([]);
    }
  }

  useEffect(() => { 
    load(); 
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);
  
  useEffect(() => {
    const t = setTimeout(() => load(), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const allSelected = useMemo(() => 
    rows.length > 0 && rows.every(r => selected[r.thread_id]), 
    [rows, selected]
  );

  async function bulk(action: string) {
    const threadIds = Object.keys(selected).filter(k => selected[k]);
    if (!threadIds.length) return;
    
    try {
      await fetch("/api/inbox/bulk-new", {
        method: "POST", 
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ action, threadIds })
      });
      
      setSelected({});
      await load();
    } catch (error) {
      console.error("Failed to perform bulk action:", error);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Input 
          placeholder="Search subject, name, company, body..." 
          value={q} 
          onChange={(e) => setQ(e.target.value)} 
        />
        <select 
          value={filter} 
          onChange={(e)=>setFilter(e.target.value as any)} 
          className="border rounded-md px-2 h-9"
        >
          <option value="all">All</option>
          <option value="unread">Unread</option>
          <option value="replied">Replied</option>
          <option value="awaiting">Awaiting</option>
        </select>
        <Button variant="secondary" onClick={() => bulk("mark_read")}>
          Mark Read
        </Button>
        <Button variant="secondary" onClick={() => bulk("mark_unread")}>
          Mark Unread
        </Button>
        <Button variant="outline" onClick={() => bulk("archive")}>
          Archive
        </Button>
      </div>

      <div className="rounded-xl border divide-y">
        <div className="flex items-center gap-2 p-2">
          <Checkbox 
            checked={!!allSelected} 
            onCheckedChange={(v) => {
              const next: Record<string, boolean> = {};
              if (v) rows.forEach(r => next[r.thread_id] = true);
              setSelected(v ? next : {});
            }} 
          />
          <span className="text-sm text-muted-foreground">
            {Object.keys(selected).filter(k => selected[k]).length} selected
          </span>
        </div>

        {rows.map(r => (
          <div 
            key={r.thread_id} 
            className="flex items-center justify-between p-3 hover:bg-muted/40"
          >
            <div className="flex items-center gap-3 flex-1">
              <Checkbox 
                checked={!!selected[r.thread_id]} 
                onCheckedChange={(v)=>
                  setSelected(s => ({...s, [r.thread_id]: !!v}))
                } 
              />
              <button 
                className="text-left flex-1" 
                onClick={()=>onOpen(r.thread_id)}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  {r.unread_count > 0 ? (
                    <Badge>Unread {r.unread_count}</Badge>
                  ) : null}
                  <ReplyState replied={r.replied} />
                  {r.lead_status?.status && (
                    <LeadStatusBadge 
                      status={r.lead_status.status as any} 
                      size="sm" 
                    />
                  )}
                  <span className="font-medium">
                    {r.subject ?? "(no subject)"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(r.last_message_at).toLocaleString()}
                  </span>
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  {r.lead_name || r.lead_email} 
                  {r.company ? ` • ${r.company}` : ""} 
                  {r.last_body ? ` — ${r.last_body.slice(0, 120)}` : ""}
                </div>
              </button>
            </div>
          </div>
        ))}
        
        {rows.length === 0 && (
          <div className="p-8 text-center text-muted-foreground">
            No threads found
          </div>
        )}
      </div>
    </div>
  );
}

