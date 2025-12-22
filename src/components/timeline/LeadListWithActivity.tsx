"use client";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/Input";

type Row = {
  lead_id: string;
  email: string | null;
  name: string | null;
  last_event_at: string | null;
  last_event_type: string | null;
  opens: number;
  clicks: number;
  replied: boolean;
};

export default function LeadListWithActivity() {
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");

  const load = async (query = "") => {
    const r = await fetch(
      `/api/leads/activity?q=${encodeURIComponent(query)}&limit=50`
    );
    const j = await r.json();
    setRows(j.rows || []);
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Input
          placeholder="Search leads…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button className="px-3 py-2 rounded-xl border" onClick={() => load(q)}>
          Search
        </button>
      </div>
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
        {rows.map((r) => (
          <Card key={r.lead_id} className="p-3">
            <CardContent className="p-0">
              <div className="flex items-center justify-between">
                <div className="grid">
                  <span className="font-semibold">
                    {r.name || r.email || "Lead"}
                  </span>
                  <span className="text-sm text-muted-foreground">{r.email}</span>
                </div>
                <div className="flex gap-2">
                  {r.replied && (
                    <Badge className="bg-green-600 text-white">Replied</Badge>
                  )}
                  {r.opens > 0 && (
                    <Badge className="bg-amber-500 text-black">
                      {r.opens} Open{r.opens > 1 ? "s" : ""}
                    </Badge>
                  )}
                  {r.clicks > 0 && (
                    <Badge className="bg-blue-600 text-white">
                      {r.clicks} Click{r.clicks > 1 ? "s" : ""}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                Last: {r.last_event_type ? r.last_event_type : "—"} ·{" "}
                {r.last_event_at
                  ? new Date(r.last_event_at).toLocaleString()
                  : "—"}
              </div>
              <a
                href={`/leads/${r.lead_id}`}
                className="text-sm underline mt-2 inline-block"
              >
                Open timeline →
              </a>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

