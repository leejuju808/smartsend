"use client";

import { useCallback, useEffect, useState } from "react";

export type SeatCheck = {
  seats_used: number;
  seat_limit: number | null;
  can_add_member: boolean;
};

export function useSeatCheck() {
  const [data, setData] = useState<SeatCheck | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/team/seat-check");
      const json = await res.json();
      if (res.ok && !json.error) {
        setData(json);
      } else {
        // On error, set default values
        setData({
          seats_used: 0,
          seat_limit: null,
          can_add_member: true,
        });
      }
    } catch (error) {
      // On fetch error, set default values
      setData({
        seats_used: 0,
        seat_limit: null,
        can_add_member: true,
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, reload: load };
}

