"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ApiKey {
  id: string;
  workspace_id: string;
  label: string;
  api_key: string;
  status: string;
  created_at: string;
  last_used_at?: string;
}

export default function DeveloperKeysPanel() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [label, setLabel] = useState("");
  const [loading, setLoading] = useState(false);
  const [workspaceId, setWorkspaceId] = useState<string>("");

  // Get workspace ID from URL or context
  useEffect(() => {
    // You might want to get this from your auth context or URL params
    // For now, using a placeholder - you'll need to implement proper workspace detection
    const currentWorkspaceId = "your-workspace-id"; // Replace with actual workspace ID
    setWorkspaceId(currentWorkspaceId);
  }, []);

  async function load() {
    if (!workspaceId) return;
    
    try {
      const res = await fetch(`/api/devkeys?workspace_id=${workspaceId}`);
      const data = await res.json();
      setKeys(data.keys || []);
    } catch (error) {
      console.error("Failed to load API keys:", error);
    }
  }

  async function createKey() {
    if (!label.trim() || !workspaceId) return;
    
    setLoading(true);
    try {
      const res = await fetch("/api/devkeys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace_id: workspaceId, label: label.trim() }),
      });
      const data = await res.json();
      
      if (data.key) {
        alert(`API Key Created:\n${data.key}\n\nPlease copy this key now - it won't be shown again!`);
        setLabel("");
        await load();
      } else if (data.error) {
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error("Failed to create API key:", error);
      alert("Failed to create API key. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function revoke(id: string) {
    if (!confirm("Are you sure you want to revoke this API key? This action cannot be undone.")) return;
    
    try {
      const res = await fetch("/api/devkeys", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: "revoked" }),
      });
      
      if (res.ok) {
        await load();
      } else {
        const data = await res.json();
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error("Failed to revoke API key:", error);
      alert("Failed to revoke API key. Please try again.");
    }
  }

  useEffect(() => {
    if (workspaceId) {
      load();
    }
  }, [workspaceId]);

  return (
    <div className="rounded-2xl border p-6 space-y-4">
      <div>
        <h3 className="text-lg font-semibold">🔑 Developer API Keys</h3>
        <p className="text-sm text-zinc-500 mt-1">
          Generate API keys to integrate with external services and applications.
        </p>
      </div>

      <div className="flex gap-2">
        <Input 
          placeholder="Label (e.g. Zapier Integration)" 
          value={label} 
          onChange={(e) => setLabel(e.target.value)}
          className="flex-1"
        />
        <Button 
          onClick={createKey} 
          disabled={loading || !label.trim() || !workspaceId} 
          className="bg-yellow-500 hover:bg-yellow-600 text-black"
        >
          {loading ? "Creating..." : "Generate Key"}
        </Button>
      </div>

      <div className="mt-4 space-y-3">
        {keys.length === 0 && (
          <div className="text-center py-8">
            <p className="text-sm text-zinc-500">No API keys created yet.</p>
            <p className="text-xs text-zinc-400 mt-1">Create your first key to get started.</p>
          </div>
        )}
        
        {keys.map((key) => (
          <div key={key.id} className="border rounded-lg p-4 flex items-center justify-between">
            <div className="flex-1">
              <div className="font-semibold text-sm">{key.label}</div>
              <div className="text-xs text-zinc-600 mt-1">
                {key.api_key.slice(0, 16)}... • {key.status}
              </div>
              <div className="text-xs text-zinc-400 mt-1">
                Created: {new Date(key.created_at).toLocaleDateString()}
                {key.last_used_at && (
                  <span> • Last used: {new Date(key.last_used_at).toLocaleDateString()}</span>
                )}
              </div>
            </div>
            <Button 
              variant="secondary" 
              size="sm" 
              onClick={() => revoke(key.id)} 
              disabled={key.status === "revoked"}
              className="ml-4"
            >
              {key.status === "revoked" ? "Revoked" : "Revoke"}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}