"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@/lib/supabase";

type RevenueActivity = {
  workspace_id: string;
  as_of: string;
  emails_sent: { last_7_days: number; all_time: number };
  replies_received: number;
  hot_leads: number;
  warm_leads: number;
  dead_leads: number;
  jobs_in_conversation: number;
  estimated_job_value: number;
};

function formatCount(n: number) {
  return (n || 0).toLocaleString();
}

function formatDollars(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(n) ? n : 0);
}

export default function RevenueActivityPage() {
  const supabase = useMemo(() => createClientComponentClient(), []);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [data, setData] = useState<RevenueActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadWorkspace = async () => {
      try {
        const activeWorkspace =
          typeof window !== "undefined" ? localStorage.getItem("active_workspace") : null;
        if (activeWorkspace) {
          setWorkspaceId(activeWorkspace);
          return;
        }

        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setError("Not logged in.");
          setLoading(false);
          return;
        }

        const { data: membership, error: memberErr } = await supabase
          .from("workspace_members")
          .select("workspace_id")
          .eq("user_id", user.id)
          .limit(1)
          .maybeSingle();

        if (memberErr) throw memberErr;
        if (membership?.workspace_id) {
          setWorkspaceId(membership.workspace_id);
        } else {
          setError("No workspace found for this user.");
          setLoading(false);
        }
      } catch (e: any) {
        setError(e?.message || "Failed to load workspace.");
        setLoading(false);
      }
    };

    loadWorkspace();
  }, [supabase]);

  useEffect(() => {
    const load = async () => {
      if (!workspaceId) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/revenue-activity?workspace_id=${workspaceId}`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Failed to load revenue activity.");
        setData(json);
      } catch (e: any) {
        setError(e?.message || "Failed to load revenue activity.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [workspaceId]);

  return (
    <div className="py-6">
      <div className="max-w-3xl">
        <div className="flex items-baseline justify-between">
          <h1 className="text-2xl font-bold text-slate-900">Revenue Activity</h1>
          {data?.as_of ? (
            <div className="text-xs text-slate-500">As of {new Date(data.as_of).toLocaleString()}</div>
          ) : null}
        </div>

        <div className="mt-6 rounded-lg border bg-white p-6">
          {loading ? (
            <div className="text-sm text-slate-600">Loading…</div>
          ) : error ? (
            <div className="text-sm text-rose-700">{error}</div>
          ) : !data ? (
            <div className="text-sm text-slate-600">No data.</div>
          ) : (
            <div className="space-y-3 text-lg text-slate-900">
              <div className="tabular-nums">
                You sent <span className="font-extrabold">{formatCount(data.emails_sent.last_7_days)}</span> emails (last 7 days)
              </div>
              <div className="tabular-nums">
                You sent <span className="font-extrabold">{formatCount(data.emails_sent.all_time)}</span> emails (all-time)
              </div>

              <div className="h-px bg-slate-100" />

              <div className="tabular-nums">
                Replies received: <span className="font-extrabold">{formatCount(data.replies_received)}</span>
              </div>
              <div className="tabular-nums">
                You have <span className="font-extrabold">{formatCount(data.hot_leads)}</span> hot homeowners
              </div>
              <div className="tabular-nums">
                You have <span className="font-extrabold">{formatCount(data.warm_leads)}</span> warm homeowners
              </div>
              <div className="tabular-nums">
                Dead leads: <span className="font-extrabold">{formatCount(data.dead_leads)}</span>
              </div>
              <div className="tabular-nums">
                Jobs in conversation: <span className="font-extrabold">{formatCount(data.jobs_in_conversation)}</span>
              </div>

              <div className="h-px bg-slate-100" />

              <div className="tabular-nums text-xl">
                Estimated value: <span className="font-black">{formatDollars(data.estimated_job_value)}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}








