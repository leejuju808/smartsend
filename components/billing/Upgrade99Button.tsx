"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

export function Upgrade99Button({
  className,
  label = "Upgrade ($99)",
}: {
  className?: string;
  label?: string;
}) {
  const [loading, setLoading] = React.useState(false);

  return (
    <button
      type="button"
      className={className}
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        try {
          const res = await fetch("/api/billing/checkout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ plan_key: "starter" }),
          });
          const json = await res.json().catch(() => ({}));
          if (!res.ok || !json?.url) {
            throw new Error(json?.error || "Failed to start checkout");
          }
          window.location.href = json.url;
        } finally {
          setLoading(false);
        }
      }}
    >
      {loading ? (
        <span className="inline-flex items-center gap-2">
          <Loader2 className="h-3 w-3 animate-spin" />
          Redirecting…
        </span>
      ) : (
        label
      )}
    </button>
  );
}








