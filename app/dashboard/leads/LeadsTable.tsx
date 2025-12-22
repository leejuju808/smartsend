"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardContent } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/checkbox";
import { PipelineStageBadge } from "@/components/ui/PipelineStageBadge";
import { useToast } from "../../../components/useToast";
import { Loader2 } from "lucide-react";
import { retryFailedLeads } from "@/app/actions/retryFailedLeads";

type Lead = {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  status: "New" | "Queued" | "Sent" | "Opened" | "Clicked" | "Replied" | "Bounced";
  last_activity_at: string | null;
  pipeline_stage?: string | null;
};

const PAGE_SIZE = 25;

export default function LeadsTable() {
  const { notify } = useToast();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<Lead["status"] | "All">("All");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [retrying, setRetrying] = useState(false);

  const fetchLeads = async (opts?: { reset?: boolean }) => {
    setLoading(true);
    const from = (opts?.reset ? 0 : page) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
      .from("leads")
      .select("*", { count: "exact" })
      .order("last_activity_at", { ascending: false, nullsFirst: false })
      .range(from, to);

    if (statusFilter !== "All") query = query.eq("status", statusFilter);
    if (q.trim()) {
      // Simple OR filter across key columns
      query = query.or(
        ["email.ilike.%"+q+"%", "company.ilike.%"+q+"%", "first_name.ilike.%"+q+"%", "last_name.ilike.%"+q+"%"].join(",")
      );
    }

    const { data, error, count } = await query;
    if (error) {
      notify(`Error loading leads: ${error.message}`);
    } else {
      setLeads((prev) => (opts?.reset ? (data as Lead[]) : (data as Lead[])));
      setTotal(count ?? 0);
      if (opts?.reset) setPage(0);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchLeads({ reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  useEffect(() => {
    const t = setTimeout(() => fetchLeads({ reset: true }), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  // Realtime subscription: update row & notify when status flips to Replied
  useEffect(() => {
    const channel = supabase
      .channel("leads-updates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leads" },
        (payload: any) => {
          setLeads((prev) => {
            const idx = prev.findIndex((l) => l.id === payload.new.id);
            if (idx === -1) return prev; // not on current page; ignore
            const next = [...prev];
            const before = next[idx];
            next[idx] = { ...before, ...payload.new };
            // toast on transition to Replied
            if (before.status !== "Replied" && payload.new.status === "Replied") {
              notify(`⚡ ${payload.new.email} just replied!`);
            }
            return next;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const repliedCount = useMemo(() => leads.filter((l) => l.status === "Replied").length, [leads]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Handle individual checkbox
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  // Handle "Select All"
  const toggleSelectAll = () => {
    if (selectedIds.length === leads.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(leads.map((l) => l.id));
    }
  };

  // Bulk retry
  const handleBulkRetry = async () => {
    if (selectedIds.length === 0) return;
    setRetrying(true);
    try {
      const result = await retryFailedLeads(selectedIds);
      if (result.success) {
        notify(`Retry triggered for ${selectedIds.length} leads`);
        setSelectedIds([]);
        fetchLeads();
      } else {
        notify(`Error: ${result.error}`);
      }
    } catch (error) {
      notify(`Error retrying leads: ${error}`);
    } finally {
      setRetrying(false);
    }
  };

  const StatusBadge = ({ status }: { status: Lead["status"] }) => {
    if (status === "Replied") return <Badge className="bg-yellow-400 text-black">Replied</Badge>;
    if (status === "Opened") return <Badge variant="secondary">Opened</Badge>;
    if (status === "Clicked") return <Badge variant="outline">Clicked</Badge>;
    if (status === "Bounced") return <Badge variant="destructive">Bounced</Badge>;
    if (status === "Sent") return <Badge>Sent</Badge>;
    if (status === "Queued") return <Badge>Queued</Badge>;
    return <Badge variant="secondary">New</Badge>;
  };

  return (
    <Card className="w-full">
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Input
            placeholder="Search email, name, company…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-64"
          />
          <select
            className="border rounded-md h-9 px-2"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
          >
            {["All","New","Queued","Sent","Opened","Clicked","Replied","Bounced"].map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="text-sm opacity-75">
          Replied on page: <span className="font-semibold">{repliedCount}</span> • Total:{" "}
          <span className="font-semibold">{total}</span>
        </div>
      </CardHeader>

      {/* Bulk Select Toolbar */}
      {selectedIds.length > 0 && (
        <div className="flex items-center justify-between px-6 py-3 bg-gray-50 border-t">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">
              {selectedIds.length} selected
            </span>
          </div>
          <Button
            onClick={handleBulkRetry}
            disabled={retrying}
            className="bg-yellow-500 hover:bg-yellow-400 text-black"
          >
            {retrying ? "Retrying..." : `Retry Selected (${selectedIds.length})`}
          </Button>
        </div>
      )}

      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 p-6">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading leads…</span>
          </div>
        ) : leads.length === 0 ? (
          <div className="p-6 text-sm opacity-70">No leads found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 pr-3 w-12">
                    <Checkbox
                      checked={selectedIds.length === leads.length && leads.length > 0}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Select all"
                    />
                  </th>
                  <th className="text-left py-2 pr-3">Lead</th>
                  <th className="text-left py-2 pr-3">Company</th>
                  <th className="text-left py-2 pr-3">Pipeline Stage</th>
                  <th className="text-left py-2 pr-3">Status</th>
                  <th className="text-left py-2 pr-3">Last Activity</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((l) => (
                  <tr key={l.id} className="border-b hover:bg-muted/50">
                    <td className="py-2 pr-3">
                      <Checkbox
                        checked={selectedIds.includes(l.id)}
                        onCheckedChange={() => toggleSelect(l.id)}
                        aria-label={`Select ${l.email}`}
                      />
                    </td>
                    <td className="py-2 pr-3">
                      <div className="font-medium">{l.email}</div>
                      <div className="text-xs opacity-70">
                        {[l.first_name, l.last_name].filter(Boolean).join(" ")}
                      </div>
                    </td>
                    <td className="py-2 pr-3">{l.company || "-"}</td>
                    <td className="py-2 pr-3">
                      <PipelineStageBadge stage={l.pipeline_stage} />
                    </td>
                    <td className="py-2 pr-3">
                      <StatusBadge status={l.status} />
                    </td>
                    <td className="py-2 pr-3">
                      {l.last_activity_at
                        ? new Date(l.last_activity_at).toLocaleString()
                        : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex items-center justify-between mt-4">
          <div className="text-xs opacity-70">
            Page {page + 1} of {pages}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" disabled={page === 0 || loading}
              onClick={() => { setPage((p) => Math.max(0, p - 1)); fetchLeads(); }}>
              Prev
            </Button>
            <Button variant="outline" disabled={page + 1 >= pages || loading}
              onClick={() => { setPage((p) => p + 1); fetchLeads(); }}>
              Next
            </Button>
            <Button onClick={() => fetchLeads()} disabled={loading}>
              Refresh
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
} 