"use client";

import * as React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/src/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Segment = {
  id: string;
  name: string;
};

type Props = {
  accountId: string;
  campaignId: string;
  value: string | null;
  onChange?: (segmentId: string | null) => void;
  className?: string;
};

export function CampaignTargetSegmentSelect({
  accountId,
  campaignId,
  value,
  onChange,
  className,
}: Props) {
  const [segments, setSegments] = React.useState<Segment[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    let ignore = false;
    const loadSegments = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/segments?accountId=${accountId}&forCampaigns=true`);
        if (!res.ok) return;
        const json = await res.json();
        if (!ignore) {
          setSegments(json.data ?? json ?? []);
        }
      } catch (e) {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    if (accountId) {
      void loadSegments();
    }
    return () => {
      ignore = true;
    };
  }, [accountId]);

  const handleChange = async (next: string) => {
    const segmentId = next === "everyone" ? null : next;

    onChange?.(segmentId);

    setSaving(true);
    try {
      await fetch(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segmentId }),
      });
    } catch (e) {
      // could show toast
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={cn("space-y-1", className)}>
      <Label className="text-xs">Target segment</Label>
      <div className="flex items-center gap-2">
        <Select
          disabled={loading || saving}
          value={value ?? "everyone"}
          onValueChange={handleChange}
        >
          <SelectTrigger className="w-[260px] h-9 text-xs">
            <SelectValue placeholder="Everyone" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="everyone">Everyone in account</SelectItem>
            {segments.map((segment) => (
              <SelectItem key={segment.id} value={segment.id}>
                {segment.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {saving && (
          <span className="text-[11px] text-muted-foreground">
            Saving…
          </span>
        )}
      </div>
    </div>
  );
}

