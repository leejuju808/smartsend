"use client";

import { useRouter, useSearchParams } from "next/navigation";

export function AssigneeFilter({ campaignId }: { campaignId?: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const current = sp.get("assignee") ?? "all";

  return (
    <select
      className="border rounded-md text-sm px-2 py-1"
      value={current}
      onChange={(e) => {
        const v = e.target.value;
        const p = new URLSearchParams(sp.toString());
        if (v === "all") p.delete("assignee");
        else p.set("assignee", v);
        router.push(`?${p.toString()}`);
      }}
    >
      <option value="all">All Assignees</option>
      <option value="unassigned">Unassigned</option>
      <option value="me">Assigned to me</option>
    </select>
  );
}

