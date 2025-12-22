"use client";

import useSWR from "swr";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type SavedView = {
  id: string;
  name: string;
};

type ApiResponse = {
  ok: boolean;
  views?: SavedView[];
};

export function ViewPicker({ onChange }: { onChange: (id: string) => void }) {
  const { data } = useSWR<ApiResponse>(
    "/api/saved-views?scope=leads",
    (url) => fetch(url).then((res) => res.json())
  );

  return (
    <Select onValueChange={onChange}>
      <SelectTrigger className="w-[320px]">
        <SelectValue placeholder="Choose a saved view" />
      </SelectTrigger>
      <SelectContent>
        {data?.views?.map((view) => (
          <SelectItem key={view.id} value={view.id}>
            {view.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

