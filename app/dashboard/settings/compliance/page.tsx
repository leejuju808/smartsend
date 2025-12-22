"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";

type Suppression = {
  id: string;
  email: string;
  reason: string | null;
  source: string | null;
  campaign_id: string | null;
  created_at: string;
};

export default function ComplianceSettingsPage() {
  const [suppressions, setSuppressions] = useState<Suppression[]>([]);
  const [loading, setLoading] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [reason, setReason] = useState("");
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const supabase = createClientComponentClient();

  useEffect(() => {
    const loadWorkspaceId = async () => {
      // Try localStorage first
      const wsFromStorage =
        typeof window !== "undefined"
          ? localStorage.getItem("active_workspace")
          : null;

      if (wsFromStorage) {
        setWorkspaceId(wsFromStorage);
        return;
      }

      // Get user's first workspace
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from("workspace_members")
          .select("workspace_id")
          .eq("user_id", user.id)
          .limit(1)
          .maybeSingle();

        if (data?.workspace_id) {
          setWorkspaceId(data.workspace_id);
        }
      }
    };

    loadWorkspaceId();
  }, [supabase]);

  const load = async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const res = await fetch("/api/suppressions/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceId }),
      });
      const json = await res.json();
      setSuppressions(json.suppressions || []);
    } catch (error) {
      console.error("Failed to load suppressions:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (workspaceId) {
      load();
    }
  }, [workspaceId]);

  const add = async () => {
    if (!workspaceId || !newEmail) return;
    try {
      const res = await fetch("/api/suppressions/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          email: newEmail,
          reason: reason || "manual",
        }),
      });
      if (res.ok) {
        setNewEmail("");
        setReason("");
        await load();
      }
    } catch (error) {
      console.error("Failed to add suppression:", error);
    }
  };

  const remove = async (id: string) => {
    try {
      const res = await fetch(`/api/suppressions/delete/${id}`, {
        method: "POST",
      });
      if (res.ok) {
        await load();
      }
    } catch (error) {
      console.error("Failed to remove suppression:", error);
    }
  };

  if (!workspaceId) {
    return (
      <div className="p-6">
        <div className="text-sm text-muted-foreground">
          Loading workspace...
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">Compliance & Suppression</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Suppression list</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <p className="text-xs text-muted-foreground">
            Emails on this list will never receive outreach from this workspace.
            Entries are added automatically when someone unsubscribes, and you
            can also add addresses manually.
          </p>

          <div className="flex flex-col md:flex-row gap-2">
            <Input
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="email@example.com"
              className="md:flex-1 h-8 text-xs"
              onKeyDown={(e) => {
                if (e.key === "Enter" && newEmail) {
                  add();
                }
              }}
            />
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (optional)"
              className="md:w-56 h-8 text-xs"
            />
            <Button size="sm" onClick={add} disabled={!newEmail}>
              Add
            </Button>
          </div>

          <div className="border rounded max-h-[320px] overflow-y-auto divide-y">
            {loading && (
              <div className="p-2 text-xs text-muted-foreground">
                Loading suppressions…
              </div>
            )}
            {!loading && suppressions.length === 0 && (
              <div className="p-2 text-xs text-muted-foreground">
                No suppressed emails yet.
              </div>
            )}
            {suppressions.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between px-2 py-1 text-xs"
              >
                <div>
                  <div className="font-medium">{s.email}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {s.reason || "—"} ·{" "}
                    {new Date(s.created_at).toLocaleString()}
                  </div>
                </div>
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => remove(s.id)}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

