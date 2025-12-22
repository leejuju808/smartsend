"use client";

import * as React from "react";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type OutreachStatus = "uncontacted" | "contacted" | "warm" | "hot" | "dead" | "closed";

type LeadRow = {
  id: string;
  campaign_id?: string | null;
  email: string;
  first_name: string | null;
  last_name: string | null;
  outreach_status: OutreachStatus | null;
  last_contacted_at: string | null;
  last_reply_at: string | null;
  reason_dead: string | null;
};

const FILTERS: Array<{ key: "all" | OutreachStatus; label: string }> = [
  { key: "all", label: "All" },
  { key: "hot", label: "Hot" },
  { key: "warm", label: "Warm" },
  { key: "dead", label: "Dead" },
  { key: "uncontacted", label: "Uncontacted" },
];

function pillClass(status: OutreachStatus | null) {
  switch (status) {
    case "hot":
      return "bg-red-500/15 text-red-300 border border-red-400/30";
    case "warm":
      return "bg-amber-500/15 text-amber-300 border border-amber-400/30";
    case "dead":
      return "bg-slate-500/15 text-slate-300 border border-slate-400/30";
    case "contacted":
      return "bg-blue-500/15 text-blue-300 border border-blue-400/30";
    case "closed":
      return "bg-violet-500/15 text-violet-300 border border-violet-400/30";
    case "uncontacted":
    default:
      return "bg-neutral-800/60 text-neutral-200 border border-neutral-700";
  }
}

function formatName(l: LeadRow) {
  const n = [l.first_name, l.last_name].filter(Boolean).join(" ").trim();
  return n || "—";
}

function formatDate(v: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

export default function CampaignLeadsClient({ campaignId }: { campaignId: string }) {
  const supabase = React.useMemo(() => createClientComponentClient(), []);
  const [rows, setRows] = React.useState<LeadRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [q, setQ] = React.useState("");
  const [filter, setFilter] = React.useState<"all" | OutreachStatus>("all");
  const [busy, setBusy] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("leads")
      .select(
        "id,campaign_id,email,first_name,last_name,outreach_status,last_contacted_at,last_reply_at,reason_dead"
      )
      .eq("campaign_id", campaignId)
      .order("last_reply_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to load campaign leads:", error);
      setRows([]);
    } else {
      setRows((data || []) as LeadRow[]);
    }
    setLoading(false);
  }, [campaignId, supabase]);

  React.useEffect(() => {
    load();
  }, [load]);

  const filtered = React.useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== "all" && (r.outreach_status || "uncontacted") !== filter) return false;
      if (!s) return true;
      const name = `${r.first_name || ""} ${r.last_name || ""}`.toLowerCase();
      return r.email.toLowerCase().includes(s) || name.includes(s);
    });
  }, [rows, q, filter]);

  const setStatus = async (leadId: string, status: OutreachStatus) => {
    setBusy(leadId);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/leads/${leadId}/outreach-status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to update status");
      await load();
    } catch (e) {
      console.error(e);
      alert((e as any)?.message || "Failed to update lead status");
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-4">
      <Card className="border border-neutral-800 bg-black/40">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-xl">Leads</CardTitle>
            <div className="text-xs text-neutral-400">
              Hot/Warm/Dead are outreach labels driven by reply classification.
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex gap-2 flex-wrap">
              {FILTERS.map((f) => (
                <Button
                  key={f.key}
                  size="sm"
                  variant={filter === f.key ? "default" : "outline"}
                  onClick={() => setFilter(f.key as any)}
                >
                  {f.label}
                </Button>
              ))}
            </div>
            <div className="w-full sm:w-72">
              <Input
                placeholder="Search name or email…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="bg-neutral-900 border-neutral-800"
              />
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="text-sm text-neutral-400">Loading…</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-neutral-400 border-b border-neutral-800">
                    <th className="py-2 pr-3">Name</th>
                    <th className="py-2 pr-3">Email</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Last Contacted</th>
                    <th className="py-2 pr-3">Last Reply</th>
                    <th className="py-2 pr-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-neutral-500">
                        No leads match your filters.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((l) => {
                      const status = (l.outreach_status || "uncontacted") as OutreachStatus;
                      const fullName = formatName(l);
                      const estHref = `/dashboard/estimates?create=1&email=${encodeURIComponent(
                        l.email
                      )}&name=${encodeURIComponent(fullName === "—" ? "" : fullName)}`;

                      return (
                        <tr key={l.id} className="border-b border-neutral-900">
                          <td className="py-3 pr-3">{fullName}</td>
                          <td className="py-3 pr-3 font-medium">{l.email}</td>
                          <td className="py-3 pr-3">
                            <Badge className={`${pillClass(status)} w-fit`}>
                              {status.toUpperCase()}
                            </Badge>
                            {status === "dead" && l.reason_dead ? (
                              <div className="text-[11px] text-neutral-500 mt-1">{l.reason_dead}</div>
                            ) : null}
                          </td>
                          <td className="py-3 pr-3 text-neutral-300">{formatDate(l.last_contacted_at)}</td>
                          <td className="py-3 pr-3 text-neutral-300">{formatDate(l.last_reply_at)}</td>
                          <td className="py-3 pr-3">
                            <div className="flex flex-wrap gap-2">
                              {status === "hot" && (
                                <Link href={estHref}>
                                  <Button size="sm">Create Estimate</Button>
                                </Link>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busy === l.id}
                                onClick={() => setStatus(l.id, "hot")}
                              >
                                Mark Hot
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busy === l.id}
                                onClick={() => setStatus(l.id, "warm")}
                              >
                                Mark Warm
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                disabled={busy === l.id}
                                onClick={() => setStatus(l.id, "dead")}
                              >
                                Mark Dead
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}









