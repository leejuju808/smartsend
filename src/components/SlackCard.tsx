"use client";
import { useEffect, useState } from "react";

export default function SlackCard() {
  const [channels, setChannels] = useState<{id:string,name:string}[]>([]);
  const [sel, setSel] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Check if Slack is connected by trying to fetch channels
    fetch("/api/integrations/slack/channels")
      .then(r => {
        if (r.ok) {
          setIsConnected(true);
          return r.json();
        }
        return [];
      })
      .then(setChannels)
      .catch(() => {});
  }, []);

  async function save() {
    if (!sel) return;
    
    setIsLoading(true);
    try {
      const response = await fetch("/api/integrations/slack/save-channel", {
        method: "POST", 
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel_id: sel })
      });
      
      if (response.ok) {
        alert("Saved. We'll post wins here!");
      } else {
        alert("Failed to save channel selection.");
      }
    } catch (error) {
      alert("Error saving channel selection.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="border rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Slack</h3>
        {!isConnected ? (
          <a 
            href="/api/integrations/slack/start" 
            className="px-3 py-2 rounded bg-black text-white text-sm hover:bg-gray-800 transition-colors"
          >
            Connect
          </a>
        ) : (
          <span className="px-3 py-1 rounded bg-green-100 text-green-800 text-sm">
            Connected
          </span>
        )}
      </div>
      
      <p className="text-sm text-gray-600">
        Post meeting wins and weekly leaderboards to a Slack channel.
      </p>
      
      {isConnected && (
        <div className="space-y-3">
          <div className="flex gap-2">
            <select 
              value={sel} 
              onChange={e => setSel(e.target.value)} 
              className="border rounded px-2 py-1 text-sm flex-1"
            >
              <option value="">Select channel…</option>
              {channels.map(c => (
                <option key={c.id} value={c.id}>#{c.name}</option>
              ))}
            </select>
            <button 
              onClick={save} 
              disabled={!sel || isLoading}
              className="px-3 py-2 rounded border text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? "Saving..." : "Save"}
            </button>
          </div>
          
          {sel && (
            <div className="text-xs text-gray-500 space-y-1">
              <p>Test your slash command in this channel:</p>
              <p>• <code className="bg-gray-100 px-1 rounded">/smartsend help</code> - See all commands</p>
              <p>• <code className="bg-gray-100 px-1 rounded">/smartsend roi</code> - Check your ROI</p>
              <p>• <code className="bg-gray-100 px-1 rounded">/smartsend leaderboard</code> - Team stats</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
} 