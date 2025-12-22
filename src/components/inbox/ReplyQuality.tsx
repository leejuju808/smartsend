"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Item = {
  thread_id: string;
  lead_id: string;
  last_inbound_at: string;
  ai_label: string | null;
  ai_intent: string | null;
  subject: string | null;
  preview: string | null;
};

const LABELS = [ "all", "positive", "neutral", "negative", "unsubscribe", "ooo", "bounce", "other" ] as const;

export default function ReplyQuality({ campaignId, onOpenThread }: { campaignId: string; onOpenThread?: (threadId: string)=>void }) {
  const [label, setLabel] = useState<typeof LABELS[number]>("all");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [offset, setOffset] = useState(0);
  const [nextOffset, setNextOffset] = useState<number | null>(0);
  const [loading, setLoading] = useState(false);

  const apiUrl = useMemo(() => {
    const u = new URL(`/api/campaigns/${campaignId}/replies`, window.location.origin);
    if (label !== "all") u.searchParams.set("label", label);
    if (q.trim()) u.searchParams.set("q", q.trim());
    u.searchParams.set("limit", "20");
    u.searchParams.set("offset", String(offset));
    return u.toString();
  }, [campaignId, label, q, offset]);

  useEffect(() => {
    setLoading(true);
    fetch(apiUrl, { cache: "no-store" })
      .then(r => r.json())
      .then(d => {
        if (offset === 0) setItems(d.items || []);
        else setItems(prev => [...prev, ...(d.items || [])]);
        setNextOffset(d.nextOffset);
      })
      .finally(() => setLoading(false));
  }, [apiUrl]); // eslint-disable-line

  function resetAndLoad() {
    setOffset(0);
    setNextOffset(0);
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Reply Quality</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <div className="flex flex-wrap gap-2">
            {LABELS.map(l => (
              <Button
                key={l}
                size="sm"
                variant={l === label ? "default" : "outline"}
                onClick={() => { setLabel(l); resetAndLoad(); }}
              >
                {l === "all" ? "All" : l.toUpperCase()}
              </Button>
            ))}
          </div>
          <div className="md:ml-auto w-full md:w-72">
            <Input
              placeholder="Search subject or preview..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") resetAndLoad(); }}
            />
          </div>
        </div>

        {/* List */}
        <div className="divide-y rounded-md border">
          {items.length === 0 && !loading && (
            <div className="p-4 text-sm text-muted-foreground">No replies match your filters.</div>
          )}
          {items.map(it => (
            <div key={it.thread_id} className="p-4 hover:bg-muted/40 cursor-pointer"
                 onClick={() => onOpenThread?.(it.thread_id)}>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{(it.ai_label || "other").toUpperCase()}</Badge>
                <div className="ml-auto text-xs text-muted-foreground">
                  {new Date(it.last_inbound_at).toLocaleString()}
                </div>
              </div>
              <div className="mt-1 font-medium truncate">{it.subject || "(no subject)"}</div>
              {it.ai_intent && (
                <div className="mt-0.5 text-xs text-muted-foreground">Intent: {it.ai_intent}</div>
              )}
              <div className="mt-0.5 text-sm text-muted-foreground line-clamp-2">{it.preview || ""}</div>
            </div>
          ))}
        </div>

        {/* Paging */}
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">{loading ? "Loading…" : `${items.length} shown`}</div>
          <Button
            variant="outline"
            disabled={loading || nextOffset == null}
            onClick={() => setOffset(nextOffset ?? 0)}
          >
            {nextOffset == null ? "End of list" : "Load more"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

