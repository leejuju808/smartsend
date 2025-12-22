"use client";

import { useEffect, useState, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";

export type ReplyFilters = {
  campaignId?: string | null;
  onlyUnread?: boolean;
  isReply?: "any" | "human" | "auto";
  q?: string;
};

export default function FiltersBar({
  campaigns,
  value,
  onChange,
}: {
  campaigns: { id: string; name: string }[];
  value: ReplyFilters;
  onChange: (v: ReplyFilters) => void;
}) {
  const [local, setLocal] = useState<ReplyFilters>(value);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => setLocal(value), [value]);

  // Debounced search
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      onChange(local);
    }, 250);
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); };
  }, [local.q, local, onChange]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
      <Select
        value={local.campaignId ?? "all"}
        onValueChange={(v) => {
          const campaignId = v === "all" ? null : v;
          setLocal((s) => ({ ...s, campaignId }));
          onChange({ ...local, campaignId });
        }}
      >
        <SelectTrigger><SelectValue placeholder="Campaign" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All campaigns</SelectItem>
          {campaigns.map(c => (
            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={local.isReply ?? "any"}
        onValueChange={(v: "any" | "human" | "auto") => {
          setLocal((s) => ({ ...s, isReply: v }));
          onChange({ ...local, isReply: v });
        }}
      >
        <SelectTrigger><SelectValue placeholder="Type" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="any">All types</SelectItem>
          <SelectItem value="human">Human replies</SelectItem>
          <SelectItem value="auto">Auto responses</SelectItem>
        </SelectContent>
      </Select>

      <div className="flex items-center space-x-2 rounded-lg border p-2">
        <Checkbox
          id="unread"
          checked={!!local.onlyUnread}
          onCheckedChange={(v) => {
            const onlyUnread = Boolean(v);
            setLocal((s) => ({ ...s, onlyUnread }));
            onChange({ ...local, onlyUnread });
          }}
        />
        <Label htmlFor="unread">Unread only</Label>
      </div>

      <Input
        placeholder="Search subject or body…"
        value={local.q ?? ""}
        onChange={(e) => {
          const q = e.target.value;
          setLocal((s) => ({ ...s, q }));
        }}
      />
    </div>
  );
}

