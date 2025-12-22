"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type SavedView = {
  id: string;
  name: string;
};

type SavedViewRunResponse = {
  ok?: boolean;
  rows?: unknown[];
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function RepliesSavedViews({ scope = "inbox" }: { scope?: "inbox" | "leads" }) {
  const [selected, setSelected] = useState<string | null>(null);
  const { data: list } = useSWR<{ ok: boolean; items?: SavedView[] }>(`/api/saved-views?scope=${scope}`, fetcher, {
    revalidateOnFocus: false,
  });

  const { mutate } = useSWR<SavedViewRunResponse>(
    selected ? `/api/saved-views/${selected}/run` : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  useEffect(() => {
    if (!selected && list?.items?.length) {
      setSelected(list.items[0].id);
    }
  }, [list, selected]);

  async function handleRun(id: string) {
    setSelected(id);
    const response = await fetch(`/api/saved-views/${id}/run`);
    const json = await response.json();
    mutate(json, false);
  }

  return (
    <div className="flex items-center gap-3">
      <Select value={selected ?? undefined} onValueChange={handleRun}>
        <SelectTrigger className="w-72">
          <SelectValue placeholder="Saved view…" />
        </SelectTrigger>
        <SelectContent>
          {(list?.items ?? []).map((view) => (
            <SelectItem key={view.id} value={view.id}>
              {view.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

