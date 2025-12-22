"use client";

import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { RoofingJobsTable } from "./RoofingJobsTable";
import { RoofingJobsFilters } from "./RoofingJobsFilters";
import { HotJobsExportButton } from "./HotJobsExportButton";
import { RoofingJobsHealthIntroBanner } from "./RoofingJobsHealthIntroBanner";
import { fetchRoofingJobsWithHealth, type RoofingJobRow } from "../_lib/fetchRoofingJobs";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useRoofingHealthRealtime } from "@/app/hooks/useRoofingHealthRealtime";

type Props = {
  orgId: string;
  initialJobs: RoofingJobRow[];
};

export const RoofingJobsPipeline: React.FC<Props> = ({
  orgId,
  initialJobs,
}) => {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [jobs, setJobs] = useState(initialJobs);
  const [filter, setFilter] = useState<"all" | "hot" | "warm" | "cold">("all");
  const [loading, setLoading] = useState(false);
  const filterRef = useRef(filter);

  // Keep filter ref up to date
  useEffect(() => {
    filterRef.current = filter;
  }, [filter]);

  const load = useCallback(
    async (filterValue: "all" | "hot" | "warm" | "cold") => {
      setLoading(true);
      setFilter(filterValue);

      const bucket = filterValue === "all" ? undefined : filterValue;

      const fresh = await fetchRoofingJobsWithHealth(
        supabase,
        orgId,
        "latest_score",
        bucket
      );

      setJobs(fresh);
      setLoading(false);
    },
    [supabase, orgId]
  );

  // 🔴 Realtime: whenever any health score changes -> reload current filter
  useRoofingHealthRealtime({
    orgId,
    onChange: () => {
      load(filterRef.current);
    },
  });

  return (
    <div className="space-y-4">
      <RoofingJobsHealthIntroBanner />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-50">Roofing Jobs</h1>
          <p className="text-sm text-zinc-400 mt-1">
            View all roofing jobs sorted by Health Score to see who's most ready to book.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <HotJobsExportButton />
          <RoofingJobsFilters activeFilter={filter} onChange={load} />
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-500">
          Updating job list…
        </div>
      ) : (
        <RoofingJobsTable jobs={jobs} />
      )}
    </div>
  );
};

