"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { createClientComponentClient } from "@/lib/supabase";

type RealityCheck = {
  workspace_id: string;
  as_of: string;
  emails_sent: { today: number; total: number };
  replies_received: { today: number; total: number };
  conversations_started: { today: number; total: number };
  leads: { hot: number; warm: number; dead: number };
};

export default function ExecutionRealityCheckPage() {
  const supabase = useMemo(() => createClientComponentClient(), []);
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [data, setData] = useState<RealityCheck | null>(null);
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
        const res = await fetch(`/api/execution/reality-check?workspace_id=${workspaceId}`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Failed to load reality check.");
        setData(json);
      } catch (e: any) {
        setError(e?.message || "Failed to load reality check.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [workspaceId]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">Execution Reality Check</h1>
        {data?.as_of ? (
          <div className="text-xs text-muted-foreground">As of {new Date(data.as_of).toLocaleString()}</div>
        ) : null}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Raw counts (no charts)</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm">Loading…</div>
          ) : error ? (
            <div className="text-sm text-red-600">{error}</div>
          ) : !data ? (
            <div className="text-sm">No data.</div>
          ) : (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">Emails Sent</div>
                  <div className="mt-1 flex items-baseline justify-between">
                    <div className="font-semibold">Today</div>
                    <div className="text-lg font-bold">{data.emails_sent.today.toLocaleString()}</div>
                  </div>
                  <div className="mt-1 flex items-baseline justify-between">
                    <div className="font-semibold">Total</div>
                    <div className="text-lg font-bold">{data.emails_sent.total.toLocaleString()}</div>
                  </div>
                </div>

                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">Replies Received</div>
                  <div className="mt-1 flex items-baseline justify-between">
                    <div className="font-semibold">Today</div>
                    <div className="text-lg font-bold">{data.replies_received.today.toLocaleString()}</div>
                  </div>
                  <div className="mt-1 flex items-baseline justify-between">
                    <div className="font-semibold">Total</div>
                    <div className="text-lg font-bold">{data.replies_received.total.toLocaleString()}</div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">Conversations Started</div>
                  <div className="mt-1 flex items-baseline justify-between">
                    <div className="font-semibold">Today</div>
                    <div className="text-lg font-bold">{data.conversations_started.today.toLocaleString()}</div>
                  </div>
                  <div className="mt-1 flex items-baseline justify-between">
                    <div className="font-semibold">Total</div>
                    <div className="text-lg font-bold">{data.conversations_started.total.toLocaleString()}</div>
                  </div>
                </div>

                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">Lead Labels</div>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    <div className="rounded border px-2 py-2">
                      <div className="text-xs text-muted-foreground">Hot</div>
                      <div className="text-lg font-bold">{data.leads.hot.toLocaleString()}</div>
                    </div>
                    <div className="rounded border px-2 py-2">
                      <div className="text-xs text-muted-foreground">Warm</div>
                      <div className="text-lg font-bold">{data.leads.warm.toLocaleString()}</div>
                    </div>
                    <div className="rounded border px-2 py-2">
                      <div className="text-xs text-muted-foreground">Dead</div>
                      <div className="text-lg font-bold">{data.leads.dead.toLocaleString()}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="text-xs text-muted-foreground">
                Notes: “Replies” + “Conversations Started” come from real inbound reply ingestion (stored as reply events). Hot/Warm/Dead are
                auto-updated on the lead when the reply is classified.
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}








