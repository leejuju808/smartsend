"use client";

import { useCallback, useEffect, useState } from "react";

export type MeetingOwnerStat = {
  owner_user_id: string | null;
  meeting_count: number;
  closed_won_value_cents: number;
};

type ResponseShape = {
  owners: MeetingOwnerStat[];
};

export function useMeetingOwnerStats() {
  const [data, setData] = useState<MeetingOwnerStat[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/meetings/owners");
      const json: ResponseShape = await res.json();
      if (res.ok && Array.isArray(json.owners)) {
        setData(json.owners);
      } else {
        setData([]);
      }
    } catch (err) {
      console.error("useMeetingOwnerStats error", err);
      setData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { owners: data, loading, reload: load };
}





