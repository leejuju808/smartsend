"use client";

import { useCallback, useEffect, useState } from "react";

export type MemberUsageRow = {
  user_id: string;
  email: string | null;
  role: string | null;
  sends_30d: number;
};

export type MemberUsageResponse = {
  members: MemberUsageRow[];
};

export function useBillingMemberUsage() {
  const [data, setData] = useState<MemberUsageResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/billing/member-usage");
    const json = await res.json();
    setData(json);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, reload: load };
}





