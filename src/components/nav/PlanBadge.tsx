"use client";

import * as React from "react";

export function PlanBadge({ workspaceId }: { workspaceId: string }) {
  const [plan, setPlan] = React.useState<string>("free");

  React.useEffect(() => {
    if (!workspaceId) return;
    fetch(`/api/profile/plan?workspaceId=${workspaceId}`)
      .then(r => r.json())
      .then(j => setPlan(j.plan || "free"))
      .catch(() => {});
  }, [workspaceId]);

  const colors: Record<string, string> = {
    free: "bg-neutral-100 text-neutral-800",
    trialing: "bg-blue-100 text-blue-800",
    active: "bg-green-100 text-green-800",
    past_due: "bg-amber-100 text-amber-800",
    canceled: "bg-rose-100 text-rose-800"
  };

  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs ${colors[plan] || colors.free}`}>
      {plan}
    </span>
  );
}