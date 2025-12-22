"use client";

import React, { useState, useCallback, useMemo } from "react";
import { RoofingJobHealthTile } from "./RoofingJobHealthTile";
import type { RoofingHealthSnapshot } from "../_lib/fetchRoofingJobHealthSnapshot";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useRoofingHealthRealtime } from "@/app/hooks/useRoofingHealthRealtime";
import { fetchRoofingJobHealthSnapshotClient } from "../_lib/fetchRoofingJobHealthSnapshotClient";

type Props = {
  orgId: string;
  initialSnapshot: RoofingHealthSnapshot | null;
};

export const RoofingJobHealthTileContainer: React.FC<Props> = ({
  orgId,
  initialSnapshot,
}) => {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [snapshot, setSnapshot] = useState<RoofingHealthSnapshot | null>(
    initialSnapshot
  );
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    const fresh = await fetchRoofingJobHealthSnapshotClient(supabase, orgId);
    setSnapshot(fresh);
    setLoading(false);
  }, [orgId, supabase]);

  useRoofingHealthRealtime({
    orgId,
    onChange: () => {
      // Any change to a health score -> refresh snapshot
      refresh();
    },
  });

  return <RoofingJobHealthTile snapshot={snapshot} isLoading={loading} />;
};

