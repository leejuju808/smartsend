"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

export type LeadStatus = "all" | "new" | "queued" | "sending" | "sent" | "failed" | "replied";

export type LeadsFilterState = {
  campaignId: string;
  status: LeadStatus;
  q: string;
  from?: string; // yyyy-mm-dd
  to?: string; // yyyy-mm-dd
  segmentId?: string;
  minScore?: number;
};

export function LeadsFilters({ value, onChange, onRefresh }: { value: LeadsFilterState; onChange: (v: LeadsFilterState) => void; onRefresh: () => void }) {
  const [segments, setSegments] = React.useState<{ id: string; name: string }[]>([]);
  const [loadingSegments, setLoadingSegments] = React.useState(false);

  function set<K extends keyof LeadsFilterState>(k: K, v: LeadsFilterState[K]) {
    onChange({ ...value, [k]: v });
  }

  React.useEffect(() => {
    async function fetchSegments() {
      try {
        setLoadingSegments(true);
        const res = await fetch("/api/segments", { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        setSegments(
          (json as { id: string; name: string }[]).map((s) => ({ id: s.id, name: s.name })).slice(0, 25)
        );
      } finally {
        setLoadingSegments(false);
      }
    }
    fetchSegments();
  }, []);

  const activeSegment = segments.find((s) => s.id === value.segmentId);

  return (
    <div className="sticky top-0 z-10 bg-background/80 backdrop-blur border-b">
      <div className="p-3 grid grid-cols-1 md:grid-cols-6 gap-2 items-end">
        <div className="md:col-span-2">
          <label className="text-xs text-muted-foreground">Search</label>
          <Input placeholder="name, email, company…" value={value.q} onChange={(e) => set("q", e.target.value)} />
        </div>

        <div>
          <label className="text-xs text-muted-foreground">Status</label>
          <Select value={value.status} onValueChange={(v) => set("status", v as LeadStatus)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["all", "new", "queued", "sending", "sent", "failed", "replied"].map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-xs text-muted-foreground">From</label>
          <Input type="date" value={value.from ?? ""} onChange={(e) => set("from", e.target.value || undefined)} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">To</label>
          <Input type="date" value={value.to ?? ""} onChange={(e) => set("to", e.target.value || undefined)} />
        </div>

        <div>
          <label className="text-xs text-muted-foreground">Segment</label>
          <Select
            value={value.segmentId ?? "all"}
            onValueChange={(v) => set("segmentId", v === "all" ? undefined : v)}
            disabled={loadingSegments}
          >
            <SelectTrigger>
              <SelectValue placeholder="All segments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All segments</SelectItem>
              {segments.map((segment) => (
                <SelectItem key={segment.id} value={segment.id}>
                  {segment.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-xs text-muted-foreground">Score ≥</label>
          <Input
            type="number"
            min={0}
            value={value.minScore ?? ""}
            placeholder="Any"
            onChange={(e) => {
              const raw = e.target.value;
              set("minScore", raw === "" ? undefined : Number(raw));
            }}
          />
        </div>

        <div className="flex gap-2 justify-end md:justify-start">
          <Button
            variant="secondary"
            onClick={() =>
              onChange({
                ...value,
                q: "",
                status: "all",
                from: undefined,
                to: undefined,
                segmentId: undefined,
                minScore: undefined,
              })
            }
          >
            Reset
          </Button>
          <Button onClick={onRefresh}>Apply</Button>
        </div>

        <div className="md:col-span-6 flex flex-wrap items-center gap-2 pt-2">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">Quick score</span>
          {[20, 40, 60, 80].map((score) => (
            <Button
              key={score}
              size="sm"
              variant={value.minScore === score ? "default" : "outline"}
              onClick={() => set("minScore", value.minScore === score ? undefined : score)}
            >
              ≥ {score}
            </Button>
          ))}
          {segments.slice(0, 5).map((segment) => (
            <Button
              key={segment.id}
              size="sm"
              variant={value.segmentId === segment.id ? "default" : "outline"}
              onClick={() => set("segmentId", value.segmentId === segment.id ? undefined : segment.id)}
            >
              {segment.name}
            </Button>
          ))}
        </div>

        {(value.segmentId || value.minScore !== undefined) && (
          <div className="md:col-span-6 flex flex-wrap gap-2">
            {value.segmentId && (
              <Badge variant="secondary" className="flex items-center gap-2">
                Segment: {activeSegment?.name ?? "Unknown"}
                <button
                  type="button"
                  onClick={() => set("segmentId", undefined)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                  aria-label="Remove segment filter"
                >
                  ×
                </button>
              </Badge>
            )}
            {value.minScore !== undefined && (
              <Badge variant="secondary" className="flex items-center gap-2">
                Score ≥ {value.minScore}
                <button
                  type="button"
                  onClick={() => set("minScore", undefined)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                  aria-label="Remove score filter"
                >
                  ×
                </button>
              </Badge>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


