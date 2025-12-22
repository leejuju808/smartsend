"use client";

import * as React from "react";
import { getBrowserSupabase } from "@/utils/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/Badge";

type Segment = {
  id: string;
  name: string;
  description: string | null;
};

interface SegmentSelectProps {
  accountId: string;
  value: string | null;
  onChange: (segmentId: string | null) => void;
  campaignId?: string; // Optional: if provided, can preview audience
}

export function SegmentSelect({ accountId, value, onChange, campaignId }: SegmentSelectProps) {
  const [segments, setSegments] = React.useState<Segment[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [audienceCount, setAudienceCount] = React.useState<number | null>(null);
  const [loadingCount, setLoadingCount] = React.useState(false);

  React.useEffect(() => {
    const supabase = getBrowserSupabase();
    setLoading(true);

    supabase
      .from("segments")
      .select("id, name, description")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) setSegments(data as Segment[]);
      })
      .finally(() => setLoading(false));
  }, [accountId]);

  // Load audience count when segment changes
  React.useEffect(() => {
    if (!value || !campaignId) {
      setAudienceCount(null);
      return;
    }

    setLoadingCount(true);
    fetch(`/api/campaigns/${campaignId}/preview-audience`)
      .then((res) => res.json())
      .then((data) => {
        if (data.count !== undefined) {
          setAudienceCount(data.count);
        }
      })
      .catch(() => {
        // Silently fail - count is optional
      })
      .finally(() => setLoadingCount(false));
  }, [value, campaignId]);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <Label>Target segment</Label>
        {audienceCount !== null && (
          <Badge variant="secondary" className="text-xs">
            {loadingCount ? "..." : `${audienceCount.toLocaleString()} leads`}
          </Badge>
        )}
      </div>
      <Select
        value={value ?? "___ALL"}
        onValueChange={(val) => {
          if (val === "___ALL") onChange(null);
          else onChange(val);
        }}
        disabled={loading}
      >
        <SelectTrigger>
          <SelectValue placeholder={loading ? "Loading segments..." : "All leads"} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="___ALL">All leads (no segment)</SelectItem>
          {segments.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        Only leads matching this segment will be queued when you launch the campaign.
      </p>
    </div>
  );
}

