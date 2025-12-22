"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Lead = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  company: string | null;
  phone: string | null;
  domain: string | null;
  created_at: string;
  score: number | null;
  score_updated_at: string | null;
};

type LeaderboardEntry = {
  lead_id: string;
  name: string | null;
  company: string | null;
  score: number | null;
  updated_at: string | null;
};

function ScoreBadge({ score }: { score: number | null | undefined }) {
  if (score === null || score === undefined) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const rounded = Math.round(score);
  const color =
    rounded > 80 ? "bg-green-500" :
    rounded > 50 ? "bg-yellow-500" :
    rounded > 30 ? "bg-orange-500" : "bg-gray-400";

  return <Badge className={`${color} text-white font-medium`}>{rounded}</Badge>;
}

export function LeadsTable({ defaultCampaignId }: { defaultCampaignId?: string }) {
  const [rows, setRows] = useState<Lead[]>([]);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [domain, setDomain] = useState("");
  const [hasEmail, setHasEmail] = useState(true);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [campaignId, setCampaignId] = useState<string | undefined>(defaultCampaignId);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  const checkedIds = useMemo(() => Object.entries(sel).filter(([,v])=>v).map(([k])=>k), [sel]);

  async function load(p = page) {
    const params = new URLSearchParams({
      page: String(p),
      limit: String(limit),
    });
    if (q) params.set("query", q);
    if (domain) params.set("domain", domain);
    if (hasEmail) params.set("has_email", "true");

    const r = await fetch(`/api/leads?${params.toString()}`);
    const j = await r.json();
    if (!r.ok) return alert(j.error || "Failed to load leads");
    setRows(j.rows ?? []);
    setTotal(j.total);
    setPage(p);
    setSel({});
  }

  useEffect(() => { load(1); /* eslint-disable-next-line */ }, [limit, domain, hasEmail]);

  // Simple debounce for search
  useEffect(() => {
    const t = setTimeout(() => load(1), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [q]);

  useEffect(() => {
    async function loadScores() {
      try {
        const r = await fetch("/api/leads/scores");
        if (!r.ok) return;
        const data = await r.json();
        setLeaderboard(
          (data ?? [])
            .slice(0, 10)
            .map((entry: any) => ({
              lead_id: entry.lead_id,
              name: entry.name ?? null,
              company: entry.company ?? null,
              score: entry.score ?? null,
              updated_at: entry.updated_at ?? null,
            }))
        );
      } catch (err) {
        console.error("Failed to load lead score leaderboard", err);
      }
    }
    loadScores();
  }, []);

  async function attach() {
    if (!campaignId) return alert("Pick a campaign");
    if (checkedIds.length === 0) return alert("Select at least one lead");
    const r = await fetch("/api/leads/bulk-attach", {
      method: "POST",
      headers: { "content-type":"application/json" },
      body: JSON.stringify({ lead_ids: checkedIds, campaign_id: campaignId })
    });
    const j = await r.json();
    if (!r.ok) return alert(j.error || "Attach failed");
    alert(`Added ${j.attached} lead(s) to campaign`);
    setSel({});
  }

  function toggleAll(on: boolean) {
    const m: Record<string, boolean> = {};
    rows.forEach(r => { m[r.id] = on; });
    setSel(m);
  }

  return (
    <Card className="p-4 space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[220px]">
          <Label className="text-xs">Search</Label>
          <Input placeholder="name, email, company, domain" value={q} onChange={(e)=>setQ(e.target.value)} />
        </div>
        <div className="w-[220px]">
          <Label className="text-xs">Domain</Label>
          <Input placeholder="e.g. acme.com" value={domain} onChange={(e)=>setDomain(e.target.value.trim())}/>
        </div>
        <div className="flex items-center gap-2 h-9 mt-5">
          <Checkbox id="hasEmail" checked={hasEmail} onCheckedChange={(v)=>setHasEmail(Boolean(v))}/>
          <Label htmlFor="hasEmail" className="text-xs">Has email</Label>
        </div>
        <div className="w-[140px]">
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

      <div className="border rounded-md overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs">
            <tr>
              <th className="px-3 py-2 text-left">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={rows.length > 0 && checkedIds.length === rows.length}
                    onCheckedChange={(v)=>toggleAll(Boolean(v))}
                  />
                  Select
                </div>
              </th>
              <th className="px-3 py-2 text-left">Name</th>
              <th className="px-3 py-2 text-left">Email</th>
              <th className="px-3 py-2 text-left">Company</th>
              <th className="px-3 py-2 text-left">Domain</th>
              <th className="px-3 py-2 text-left">Score</th>
              <th className="px-3 py-2 text-left">Created</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-t">
                <td className="px-3 py-2">
                  <Checkbox checked={!!sel[r.id]} onCheckedChange={(v)=>setSel(s=>({ ...s, [r.id]: Boolean(v) }))}/>
                </td>
                <td className="px-3 py-2">{[r.first_name, r.last_name].filter(Boolean).join(" ") || "—"}</td>
                <td className="px-3 py-2">{r.email || "—"}</td>
                <td className="px-3 py-2">{r.company || "—"}</td>
                <td className="px-3 py-2">{r.domain || "—"}</td>
                <td className="px-3 py-2">
                  <ScoreBadge score={r.score} />
                </td>
                <td className="px-3 py-2">{new Date(r.created_at).toLocaleString()}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-center text-xs text-muted-foreground" colSpan={7}>
                  No leads yet. Try importing a CSV from the Leads page.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs">
          Showing {(rows.length ? (page - 1) * limit + 1 : 0)}–{(page - 1) * limit + rows.length} of {total}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={()=>page>1 && load(page-1)}>Prev</Button>
          <div className="text-xs">Page {page}</div>
          <Button variant="outline" size="sm" onClick={()=> (page * limit) < total && load(page+1)}>Next</Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input className="w-[280px]" placeholder="Campaign ID…" value={campaignId || ""} onChange={e=>setCampaignId(e.target.value || undefined)} />
        <Button onClick={attach} disabled={checkedIds.length === 0}>Add {checkedIds.length || ""} to Campaign</Button>
      </div>

      {leaderboard.length > 0 && (
        <div className="border rounded-md p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Top Engaged Leads</h3>
            <span className="text-xs text-muted-foreground">Daily refresh</span>
          </div>
          {leaderboard.map((lead) => (
            <div key={lead.lead_id} className="flex items-center justify-between text-sm">
              <div className="flex flex-col">
                <span className="font-medium">
                  {lead.name || "Unnamed lead"}
                </span>
                {lead.company && (
                  <span className="text-xs text-muted-foreground">{lead.company}</span>
                )}
              </div>
              <ScoreBadge score={lead.score} />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
