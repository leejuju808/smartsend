"use client";

import * as React from "react";

type UpdateBadgeProps = {
  campaignId: string;
};

export function UpdateBadge({ campaignId }: UpdateBadgeProps) {
  const [count, setCount] = React.useState(0);

  React.useEffect(() => {
    let active = true;

    (async () => {
      try {
        const response = await fetch(`/api/alerts?campaignId=${campaignId}&kind=library_update`, {
          cache: "no-store",
        });

        if (!response.ok) {
          return;
        }

        const payload = await response.json();
        if (active) {
          setCount(Array.isArray(payload.alerts) ? payload.alerts.length : 0);
        }
      } catch (error) {
        console.error("[UpdateBadge] failed to fetch alerts", error);
      }
    })();

    return () => {
      active = false;
    };
  }, [campaignId]);

  if (!count) {
    return null;
  }

  return (
    <span className="ml-2 inline-flex items-center rounded-full bg-blue-600 px-2 py-0.5 text-xs text-white">
      {count} update{count > 1 ? "s" : ""} available
    </span>
  );
}







