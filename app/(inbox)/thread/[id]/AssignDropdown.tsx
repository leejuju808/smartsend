"use client";

import * as React from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

type Member = {
  id: string;
  name: string;
  role: string;
};

type AssignDropdownProps = {
  campaignId: string;
  threadId: string;
  value: string | null;
  onChange: (value: string | null) => void;
};

export function AssignDropdown({ campaignId, threadId, value, onChange }: AssignDropdownProps) {
  const { data } = useSWR<{ items: Member[] }>(
    campaignId ? `/api/campaigns/${campaignId}/people` : null,
    fetcher,
    { refreshInterval: 15000 },
  );
  const members = data?.items ?? [];
  const [pending, setPending] = React.useState(false);

  const assign = React.useCallback(
    async (next: string | null) => {
      setPending(true);
      try {
        const res = await fetch(`/api/inbox/threads/${threadId}/assign`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ assigned_to: next }),
        });
        if (!res.ok) {
          throw new Error(await res.text());
        }
        onChange(next);
      } catch (error) {
        console.error("Failed to assign thread", error);
      } finally {
        setPending(false);
      }
    },
    [onChange, threadId],
  );

  return (
    <div className="flex items-center gap-2">
      <Select
        value={value ?? ""}
        onValueChange={(next) => assign(next || null)}
        disabled={pending}
      >
        <SelectTrigger className="w-56">
          <SelectValue placeholder="Assign to…" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">Unassigned</SelectItem>
          {members.map((member) => (
            <SelectItem key={member.id} value={member.id}>
              {member.name} • {member.role}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {value ? (
        <Button variant="ghost" size="sm" onClick={() => assign(null)} disabled={pending}>
          Clear
        </Button>
      ) : null}
    </div>
  );
}





