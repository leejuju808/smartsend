"use client";

import { useEffect, useState } from "react";

/**
 * Client-side guard wrapper for buttons/forms:
 * - If entitled -> renders children as-is.
 * - If not -> disables children and shows inline nudge.
 */
export default function PaywallGate({
  userId,
  children,
  fallback,
}: {
  userId: string;
  children: React.ReactNode;
  fallback: React.ReactNode;
}) {
  const [entitled, setEntitled] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/billing/status?userId=${encodeURIComponent(userId)}`, { cache: "no-store" });
      const j = await res.json();
      setEntitled(j?.success && j?.status?.entitled ? true : false);
    })();
  }, [userId]);

  if (entitled === null) return null;
  return entitled ? <>{children}</> : <>{fallback}</>;
}
