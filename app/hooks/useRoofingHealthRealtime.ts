"use client";

import { useEffect, useRef, useMemo } from "react";
import { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type HealthRow = {
  id: string;
  org_id: string;
  job_id: string;
  latest_score: number;
  score_bucket: "hot" | "warm" | "cold";
  last_calculated_at: string;
};

type Options = {
  orgId: string;
  onChange?: (payload: RealtimePostgresChangesPayload<HealthRow>) => void;
};

export function useRoofingHealthRealtime({ orgId, onChange }: Options) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const onChangeRef = useRef(onChange);

  // Keep onChange ref up to date
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!orgId) return;

    const channel = supabase
      .channel("roofing-job-health-realtime")
      .on<HealthRow>(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "roofing_job_health_scores",
          filter: `org_id=eq.${orgId}`,
        },
        (payload) => {
          if (onChangeRef.current) onChangeRef.current(payload);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, supabase]);
}

