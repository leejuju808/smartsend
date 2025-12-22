"use client";
import useSWR from "swr";

const fetcher = (u: string) => fetch(u).then(r => r.json());

export function CampaignSelect({
  value,
  onChange
}: { value?: string | null; onChange: (v: string | null) => void }) {
  const { data } = useSWR("/api/campaigns", fetcher);
  const campaigns = data?.campaigns ?? [];

  return (
    <div className="flex items-center gap-2">
      <label className="text-sm text-muted-foreground">Campaign:</label>
      <select
        className="border rounded-md px-2 py-1 text-sm"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
      >
        <option value="">(No Campaign)</option>
        {campaigns.map((c: any) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
    </div>
  );
}