"use client";
import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

const LABELS = ["", "positive","neutral","negative","unsubscribe","ooo","bounce","other"] as const;

function labelColor(label: string | null): "default" | "secondary" | "destructive" | "outline" {
  switch (label) {
    case "positive": return "default"; // green
    case "neutral": return "secondary"; // slate
    case "negative": return "destructive"; // red
    case "unsubscribe": return "outline"; // orange
    case "ooo": return "default"; // blue (using default as blue variant)
    case "bounce": return "destructive"; // rose/red
    default: return "secondary"; // gray
  }
}

function labelBadgeClass(label: string | null): string {
  switch (label) {
    case "positive": return "bg-green-600 text-white border-green-600";
    case "neutral": return "bg-slate-500 text-white border-slate-500";
    case "negative": return "bg-red-600 text-white border-red-600";
    case "unsubscribe": return "bg-orange-500 text-white border-orange-500";
    case "ooo": return "bg-blue-500 text-white border-blue-500";
    case "bounce": return "bg-rose-500 text-white border-rose-500";
    default: return "bg-gray-500 text-white border-gray-500";
  }
}
type Thread = {
  id: string;
  last_ai_label: string | null;
  last_ai_intent: string | null;
  replied_at: string | null;
  stopped_by_reply: boolean | null;
  unread: boolean | null;
  archived_at: string | null;
  first_open_at?: string | null;
  first_click_at?: string | null;
  last_delivery_status?: string | null;
  last_bounce_reason?: string | null;
  last_bounce_hard?: boolean | null;
  leads: { first_name: string|null; last_name: string|null; email: string|null; company: string|null; domain: string|null } | null;
  last_msg?: { received_at: string; snippet: string|null; ai_confidence?: number|null }[]; // Supabase returns array for the join alias
};

export function InboxList() {
  const [rows, setRows] = useState<Thread[]>([]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [label, setLabel] = useState<string>("");
  const [minConfidence, setMinConfidence] = useState<string>("");
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [selectedIdx, setSelectedIdx] = useState<number>(-1);

  const checkedIds = useMemo(()=> Object.entries(sel).filter(([,v])=>v).map(([k])=>k), [sel]);

  async function load(p = page) {
    const params = new URLSearchParams({ page: String(p), limit: String(limit) });
    if (q) params.set("q", q);
    if (label) params.set("label", label);
    if (minConfidence) params.set("min_confidence", minConfidence);
    if (onlyUnread) params.set("only_unread","true");
    if (includeArchived) params.set("include_archived","true");

    const r = await fetch(`/api/inbox/threads?${params.toString()}`);
    const j = await r.json();
    if (!r.ok) return alert(j.error || "Failed to load inbox");
    setRows(j.rows || []);
    setTotal(j.total || 0);
    setPage(p);
    setSel({});
  }

  useEffect(()=>{ load(1); /* eslint-disable-next-line */ }, [limit, label, minConfidence, onlyUnread, includeArchived]);
  useEffect(()=>{ const t = setTimeout(()=>load(1), 350); return ()=>clearTimeout(t); /* eslint-disable-line */ }, [q]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'j' || e.key === 'k') {
        e.preventDefault();
        const dir = e.key === 'j' ? 1 : -1;
        const newIdx = Math.max(-1, Math.min(rows.length - 1, selectedIdx + dir));
        setSelectedIdx(newIdx);
        if (newIdx >= 0 && rows[newIdx]) {
          setSel(s => ({ ...s, [rows[newIdx].id]: true }));
        }
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        if (selectedIdx >= 0 && rows[selectedIdx]) {
          window.dispatchEvent(new CustomEvent("openQuickReply", { detail: { threadId: rows[selectedIdx].id } }));
        } else if (checkedIds.length === 1) {
          window.dispatchEvent(new CustomEvent("openQuickReply", { detail: { threadId: checkedIds[0] } }));
        }
      } else if (e.key === 'e' || e.key === 'E') {
        e.preventDefault();
        if (selectedIdx >= 0 && rows[selectedIdx]?.id) {
          resumeThread(rows[selectedIdx].id);
        } else if (checkedIds.length === 1) {
          resumeThread(checkedIds[0]);
        }
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [selectedIdx, rows, checkedIds]);

  function resumeThread(threadId: string) {
    fetch(`/api/inbox/thread/${threadId}/reopen`, { method: "POST" })
      .then(r => r.json())
      .then(j => {
        if (j.ok) {
          load();
        } else {
          alert(j.error || "Failed to resume thread");
        }
      });
  }

  function applyFilterPreset(preset: "hot" | "unsubscribe" | "ooo") {
    setQ("");
    setOnlyUnread(false);
    setIncludeArchived(false);
    if (preset === "hot") {
      setLabel("positive");
      setMinConfidence("0.75");
    } else if (preset === "unsubscribe") {
      setLabel("unsubscribe");
      setMinConfidence("");
    } else if (preset === "ooo") {
      setLabel("ooo");
      setMinConfidence("");
    }
  }

  function toggleAll(on: boolean) {
    const m: Record<string, boolean> = {};
    rows.forEach(r => { m[r.id] = on; });
    setSel(m);
  }

  async function bulk(action: "archive"|"unarchive"|"mark_read"|"mark_unread"|"stop_future_steps") {
    if (checkedIds.length === 0) return alert("Select at least one thread");
    const r = await fetch("/api/inbox/threads/bulk", {
      method: "POST", headers: { "content-type":"application/json" },
      body: JSON.stringify({ thread_ids: checkedIds, action })
    });
    const j = await r.json();
    if (!r.ok) return alert(j.error || "Bulk action failed");
    if (action === "stop_future_steps" && j.canceled !== undefined) {
      alert(`Stopped ${j.updated} threads and canceled ${j.canceled} future queue items`);
    }
    load();
  }

  async function exportCsv() {
    if (checkedIds.length === 0) return alert("Select at least one thread");
    const r = await fetch("/api/inbox/threads/export", {
      method: "POST", headers: { "content-type":"application/json" },
      body: JSON.stringify({ thread_ids: checkedIds })
    });
    if (!r.ok) { const j = await r.json(); return alert(j.error || "Export failed"); }
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `inbox_export_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }

  return (
    <Card className="p-4 space-y-4">
      <div className="text-sm font-medium">Inbox</div>

      {/* Saved Filter Presets */}
      <div className="flex gap-2">
        <Button 
          variant="outline" 
          size="sm"
          onClick={() => applyFilterPreset("hot")}
          className={label === "positive" && minConfidence === "0.75" ? "bg-primary text-primary-foreground" : ""}
        >
          🔥 Hot
        </Button>
        <Button 
          variant="outline" 
          size="sm"
          onClick={() => applyFilterPreset("unsubscribe")}
          className={label === "unsubscribe" ? "bg-destructive text-destructive-foreground" : ""}
        >
          ❌ Unsubscribe
        </Button>
        <Button 
          variant="outline" 
          size="sm"
          onClick={() => applyFilterPreset("ooo")}
          className={label === "ooo" ? "bg-blue-500 text-white" : ""}
        >
          OOO
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[220px]">
          <Label className="text-xs">Search</Label>
          <Input placeholder="name, email, company, domain..." value={q} onChange={(e)=>setQ(e.target.value)} />
        </div>
        <div className="w-[200px]">
          <Label className="text-xs">AI Label</Label>
          <Select value={label} onValueChange={setLabel}>
            <SelectTrigger><SelectValue placeholder="All labels" /></SelectTrigger>
            <SelectContent>
              {LABELS.map(l => <SelectItem key={l || "all"} value={l}>{l || "All"}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="w-[150px]">
          <Label className="text-xs">Min Confidence</Label>
          <Input 
            type="number" 
            step="0.1" 
            min="0" 
            max="1" 
            placeholder="0.75" 
            value={minConfidence} 
            onChange={(e)=>setMinConfidence(e.target.value)} 
          />
        </div>
        <div className="flex items-center gap-2 h-9 mt-5">
          <Checkbox id="unread" checked={onlyUnread} onCheckedChange={v=>setOnlyUnread(Boolean(v))}/>
          <Label htmlFor="unread" className="text-xs">Only unread</Label>
        </div>
        <div className="flex items-center gap-2 h-9 mt-5">
          <Checkbox id="arch" checked={includeArchived} onCheckedChange={v=>setIncludeArchived(Boolean(v))}/>
          <Label htmlFor="arch" className="text-xs">Include archived</Label>
        </div>
        <div className="w-[120px]">
          <Label className="text-xs">Per page</Label>
          <Select value={String(limit)} onValueChange={(v)=>setLimit(Number(v))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <div className="border rounded-md overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs">
            <tr>
              <th className="px-3 py-2 text-left">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={rows.length>0 && rows.every(r => sel[r.id])}
                    onCheckedChange={(v)=>toggleAll(Boolean(v))}
                  />
                  Select
                </div>
              </th>
              <th className="px-3 py-2 text-left">Lead</th>
              <th className="px-3 py-2 text-left">Label</th>
              <th className="px-3 py-2 text-left">Snippet</th>
              <th className="px-3 py-2 text-left">Last Activity</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => {
              const lm = (r.last_msg && r.last_msg[0]) ? r.last_msg[0] : null;
              const name = [r.leads?.first_name, r.leads?.last_name].filter(Boolean).join(" ") || "—";
              const email = r.leads?.email || "—";
              const isSelected = selectedIdx === idx;
              return (
                <tr 
                  key={r.id} 
                  className={`border-t cursor-pointer hover:bg-muted/40 ${r.unread ? "bg-muted/20" : ""} ${isSelected ? "bg-primary/10" : ""}`}
                  onClick={() => window.dispatchEvent(new CustomEvent("openThread", { detail: { threadId: r.id } }))}
                >
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={!!sel[r.id]} onCheckedChange={(v)=>setSel(s=>({ ...s, [r.id]: Boolean(v) }))}/>
                  </td>
                  <td className="px-3 py-2">
                    <div className="font-medium">{name}</div>
                    <div className="text-xs text-muted-foreground">{email} · {r.leads?.company || ""}</div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {r.last_delivery_status === 'bounced' && (
                        <div className="rounded-xl border border-red-300/30 bg-red-500/10 text-red-600 text-xs px-2 py-1">
                          Bounced{r.last_bounce_reason ? `: ${r.last_bounce_reason}` : ''}
                        </div>
                      )}
                      {r.stopped_by_reply && (
                        <span className="ml-2 inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-600">
                          Stopped by reply
                        </span>
                      )}
                      {r.last_ai_label && (
                        <Badge 
                          variant={labelColor(r.last_ai_label)}
                          className={labelBadgeClass(r.last_ai_label)}
                        >
                          {r.last_ai_label}
                        </Badge>
                      )}
                      {!r.last_ai_label && !r.stopped_by_reply && !r.last_delivery_status && "—"}
                      {lm?.ai_confidence !== null && lm?.ai_confidence !== undefined && (
                        <span className="text-xs text-muted-foreground">
                          {(lm.ai_confidence * 100).toFixed(0)}%
                        </span>
                      )}
                      {r.first_open_at && (
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                          Opened
                        </Badge>
                      )}
                      {r.first_click_at && (
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                          Clicked
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2">{lm?.snippet || "—"}</td>
                  <td className="px-3 py-2">{lm?.received_at ? new Date(lm.received_at).toLocaleString() : "—"}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-xs text-muted-foreground">
                Nothing here yet.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Bulk actions */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={()=>bulk("mark_read")} disabled={checkedIds.length===0}>Mark read</Button>
        <Button variant="outline" onClick={()=>bulk("mark_unread")} disabled={checkedIds.length===0}>Mark unread</Button>
        <Button variant="secondary" onClick={()=>bulk("archive")} disabled={checkedIds.length===0}>Archive</Button>
        <Button variant="ghost" onClick={()=>bulk("unarchive")} disabled={checkedIds.length===0}>Unarchive</Button>
        <Button variant="destructive" onClick={()=>bulk("stop_future_steps")} disabled={checkedIds.length===0}>Stop future steps</Button>
        <Button onClick={exportCsv} disabled={checkedIds.length===0}>Export CSV</Button>
        <div className="text-xs text-muted-foreground ml-auto">
          Selected {checkedIds.length} · Showing {(rows.length ? (page-1)*limit+1 : 0)}–{(page-1)*limit + rows.length} of {total}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={()=>page>1 && load(page-1)}>Prev</Button>
          <div className="text-xs">Page {page}</div>
          <Button variant="outline" size="sm" onClick={()=> (page*limit) < total && load(page+1)}>Next</Button>
        </div>
      </div>
    </Card>
  );
}
