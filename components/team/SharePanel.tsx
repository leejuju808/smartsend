"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

type Share = {
  id: string;
  user_id: string;
  role: "owner" | "editor" | "viewer";
  created_at: string;
};

type WorkspaceMember = {
  user_id: string;
  email?: string;
  name?: string;
};

export function SharePanel({ type, id, workspaceId }: { type: "campaign" | "sequence"; id: string; workspaceId: string }) {
  const [shares, setShares] = useState<Share[]>([]);
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState("");
  const [role, setRole] = useState<"owner" | "editor" | "viewer">("viewer");
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);

  const loadShares = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/${type}s/${id}/shares`);
      const json = await res.json();
      if (res.ok) {
        setShares(json.shares || []);
      }
    } catch (error) {
      console.error("Failed to load shares:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadWorkspaceMembers = async () => {
    setLoadingMembers(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/team-members`);
      const json = await res.json();
      if (res.ok) {
        setWorkspaceMembers(json.members || []);
      }
    } catch (error) {
      console.error("Failed to load workspace members:", error);
    } finally {
      setLoadingMembers(false);
    }
  };

  useEffect(() => {
    loadShares();
    loadWorkspaceMembers();
  }, [id, workspaceId, type]);

  const add = async () => {
    if (!userId) return;
    
    try {
      const res = await fetch(`/api/${type}s/${id}/shares/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, role }),
      });
      
      if (res.ok) {
        setUserId("");
        setRole("viewer");
        await loadShares();
      } else {
        const json = await res.json();
        alert(json.error || "Failed to add share");
      }
    } catch (error) {
      console.error("Failed to add share:", error);
      alert("Failed to add share");
    }
  };

  const remove = async (shareId: string) => {
    if (!confirm("Remove this share?")) return;
    
    try {
      const res = await fetch(`/api/${type}s/shares/${shareId}/remove`, {
        method: "POST",
      });
      
      if (res.ok) {
        await loadShares();
      } else {
        const json = await res.json();
        alert(json.error || "Failed to remove share");
      }
    } catch (error) {
      console.error("Failed to remove share:", error);
      alert("Failed to remove share");
    }
  };

  return (
    <div className="border rounded-md p-4 space-y-4">
      <h3 className="text-sm font-semibold">Shared with team</h3>

      {loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : (
        <>
          {shares.length === 0 && (
            <p className="text-xs text-muted-foreground">Not shared with anyone.</p>
          )}

          {shares.map((s) => {
            const member = workspaceMembers.find(m => m.user_id === s.user_id);
            const displayName = member?.email || member?.name || s.user_id.substring(0, 8);
            
            return (
              <div key={s.id} className="flex justify-between items-center text-xs">
                <span>{displayName} — {s.role}</span>
                <Button size="xs" variant="outline" onClick={() => remove(s.id)}>
                  Remove
                </Button>
              </div>
            );
          })}
        </>
      )}

      <div className="border-t pt-3 space-y-2">
        <p className="text-xs font-medium">Add teammate</p>
        
        {loadingMembers ? (
          <p className="text-xs text-muted-foreground">Loading members…</p>
        ) : (
          <>
            <Select value={userId} onValueChange={setUserId}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Select team member" />
              </SelectTrigger>
              <SelectContent>
                {workspaceMembers
                  .filter(m => !shares.some(s => s.user_id === m.user_id))
                  .map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {m.email || m.name || m.user_id.substring(0, 8)}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>

            <Select value={role} onValueChange={(val) => setRole(val as "owner" | "editor" | "viewer")}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="viewer">Viewer</SelectItem>
                <SelectItem value="editor">Editor</SelectItem>
                <SelectItem value="owner">Owner</SelectItem>
              </SelectContent>
            </Select>

            <Button size="sm" onClick={add} disabled={!userId}>
              Add share
            </Button>
          </>
        )}
      </div>
    </div>
  );
}







