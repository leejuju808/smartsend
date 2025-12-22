"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "actionable", label: "Actionable" },
  { key: "positive", label: "Positive" },
  { key: "ooo", label: "OOO" },
  { key: "not_interested", label: "Not Interested" },
];

const SORTS = [
  { key: "relevance", label: "AI Relevance" },
  { key: "engagement", label: "Engagement" },
  { key: "recent", label: "Most Recent" },
  { key: "unread", label: "Unread Count" },
];

export default function InboxFilters() {
  const sp = useSearchParams();
  const router = useRouter();
  const filter = sp.get("filter") ?? "all";
  const sort = sp.get("sort") ?? "relevance";

  const setParam = (k: string, v: string) => {
    const n = new URLSearchParams(sp.toString());
    n.set(k, v);
    router.push(`/inbox?${n.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {FILTERS.map((f) => (
        <Button
          key={f.key}
          variant={filter === f.key ? "default" : "secondary"}
          onClick={() => setParam("filter", f.key)}
        >
          {f.label}
        </Button>
      ))}
      <div className="ml-auto flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Sort</span>
        <Select value={sort} onValueChange={(v) => setParam("sort", v)}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            {SORTS.map((s) => (
              <SelectItem key={s.key} value={s.key}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
