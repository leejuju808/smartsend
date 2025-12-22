"use client";

import { useEffect, useState } from "react";
import { DashboardResponse } from "@/app/api/dashboard/route";

export function useDashboard() {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchDashboard() {
      try {
        setLoading(true);
        const response = await fetch("/api/dashboard");
        if (!response.ok) {
          throw new Error("Failed to load dashboard");
        }
        const json = await response.json();
        setData(json);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load dashboard");
      } finally {
        setLoading(false);
      }
    }

    fetchDashboard();
  }, []);

  return { data, loading, error };
}





























































