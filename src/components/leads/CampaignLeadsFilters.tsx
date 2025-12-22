"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

type Props = {
  value: {
    status: string;
    q: string;
    start: string | null;
    end: string | null;
  };
  onChange: (v: Props["value"]) => void;
  onRefresh: () => void;
};

const statuses = ["all", "queued", "sending", "sent", "failed", "replied"];

export default function CampaignLeadsFilters({ value, onChange, onRefresh }: Props) {
  const [localQ, setLocalQ] = useState(value.q);
  useEffect(() => setLocalQ(value.q), [value.q]);

  // Debounce search
  useEffect(() => {
    const id = setTimeout(() => onChange({ ...value, q: localQ }), 350);
    return () => clearTimeout(id);
  }, [localQ]);

  return (
    <div className="sticky top-0 z-10 mb-3 rounded-xl border bg-background/80 backdrop-blur p-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div>
          <Label>Status</Label>
          <Select value={value.status} onValueChange={(v) => onChange({ ...value, status: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {statuses.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label>Start date</Label>
          <Input type="date" value={value.start ?? ""} onChange={(e) => onChange({ ...value, start: e.target.value || null })} />
        </div>

        <div>
          <Label>End date</Label>
          <Input type="date" value={value.end ?? ""} onChange={(e) => onChange({ ...value, end: e.target.value || null })} />
        </div>

        <div>
          <Label>Search (email/company/title)</Label>
          <Input placeholder="Search…" value={localQ} onChange={(e) => setLocalQ(e.target.value)} />
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" variant="secondary" onClick={() => onRefresh()}>Refresh</Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onChange({ status: "all", q: "", start: null, end: null })}
        >
          Clear
        </Button>
      </div>
    </div>
  );
}


