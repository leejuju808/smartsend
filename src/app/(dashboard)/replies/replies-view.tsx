"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/Input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle2, Mail, Search } from "lucide-react";

type Lead = {
  id: string;
  name: string | null;
  company: string | null;
  email: string;
  email_id: string | null;
  status: "Queued" | "Sending" | "Sent" | "Bounced" | "Replied" | "Archived";
  last_message_snippet: string | null;
  updated_at: string | null;
};

export default function RepliesView() {
  const supabase = createClientComponentClient();
  const [status, setStatus] = useState<"all"|"Replied"|"NotReplied">("all");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);

  // fetcher
  const fetchRows = async () => {
    setLoading(true);
    let query = supabase.from("leads").select("*").order("updated_at", { ascending: false }).limit(200);
    if (status === "Replied") query = query.eq("status", "Replied");
    if (status === "NotReplied") query = query.neq("status", "Replied");
    if (q) query = query.or(`email.ilike.%${q}%,name.ilike.%${q}%,company.ilike.%${q}%`);
    const { data, error } = await query;
    if (!error && data) setRows(data as Lead[]);
    setLoading(false);
  };

  useEffect(() => { fetchRows(); /* eslint-disable-next-line */ }, [status, q]);

  // realtime subscription for live flip to Replied
  useEffect(() => {
    const channel = supabase
      .channel("leads-realtime")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "leads" }, (payload) => {
        setRows((prev) => {
          const idx = prev.findIndex((r) => r.id === (payload.new as any).id);
          if (idx === -1) return prev;
          const copy = [...prev];
          copy[idx] = { ...(prev[idx] as any), ...(payload.new as any) };
          return copy;
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase]);

  const filtered = useMemo(() => rows, [rows]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Replies Inbox</h1>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 opacity-60" />
            <Input placeholder="Search email, name, company…" className="pl-8 w-72" value={q} onChange={(e)=>setQ(e.target.value)} />
          </div>
          <Tabs defaultValue={status} value={status} onValueChange={(v:any)=>setStatus(v)}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="Replied">Replied</TabsTrigger>
              <TabsTrigger value="NotReplied">Not Replied</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <div className="rounded-2xl border p-0 overflow-hidden">
        <div className="grid grid-cols-12 px-4 py-2 text-sm font-medium bg-muted">
          <div className="col-span-4">Lead</div>
          <div className="col-span-3">Company</div>
          <div className="col-span-3">Email</div>
          <div className="col-span-1">Status</div>
          <div className="col-span-1 text-right">Open</div>
        </div>

        {loading ? (
          <div className="p-6 text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-sm opacity-70">No results.</div>
        ) : (
          filtered.map((r) => (
            <div key={r.id} className="grid grid-cols-12 px-4 py-3 border-t hover:bg-accent/40 transition">
              <div className="col-span-4">
                <div className="font-medium">{r.name || r.email.split("@")[0]}</div>
                <div className="line-clamp-1 text-xs opacity-70">
                  {r.last_message_snippet || "—"}
                </div>
              </div>
              <div className="col-span-3">{r.company || "—"}</div>
              <div className="col-span-3 flex items-center gap-2">
                <Mail className="h-4 w-4 opacity-60" />
                <span className="truncate">{r.email}</span>
              </div>
              <div className="col-span-1">
                {r.status === "Replied" ? (
                  <Badge className="gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Replied</Badge>
                ) : (
                  <Badge variant="secondary">Not replied</Badge>
                )}
              </div>
              <div className="col-span-1 text-right">
                <a href={`/leads/${r.id}`} className="text-sm underline">Open</a>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

