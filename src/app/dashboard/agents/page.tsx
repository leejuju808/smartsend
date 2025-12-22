"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Plus, Zap, Search, Send, Reply, TrendingUp } from "lucide-react";

interface Agent {
  id: string;
  name: string;
  status: "idle" | "scouting" | "messaging" | "paused";
  autopilot_enabled: boolean;
  target_industry?: string;
  target_role?: string;
  daily_lead_limit: number;
  daily_message_limit: number;
  leads_generated: number;
  leads_converted: number;
  messages_sent: number;
  replies_received: number;
  win_rate: number;
  created_at: string;
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchAgents();
  }, []);

  const fetchAgents = async () => {
    try {
      const res = await fetch("/api/agents");
      const data = await res.json();
      if (data.success) {
        setAgents(data.agents || []);
      }
    } catch (error) {
      console.error("Error fetching agents:", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleAutopilot = async (agentId: string, enabled: boolean) => {
    try {
      const res = await fetch(`/api/agents/${agentId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autopilot_enabled: enabled }),
      });
      if (res.ok) {
        fetchAgents();
      }
    } catch (error) {
      console.error("Error toggling autopilot:", error);
    }
  };

  const triggerProspect = async (agentId: string) => {
    try {
      const res = await fetch(`/api/agents/${agentId}/prospect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "web", limit: 10 }),
      });
      if (res.ok) {
        alert("Prospecting started!");
        fetchAgents();
      }
    } catch (error) {
      console.error("Error triggering prospect:", error);
    }
  };

  const triggerOutreach = async (agentId: string) => {
    try {
      const res = await fetch(`/api/agents/${agentId}/outreach`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 10 }),
      });
      if (res.ok) {
        alert("Outreach started!");
        fetchAgents();
      }
    } catch (error) {
      console.error("Error triggering outreach:", error);
    }
  };

  const createAgent = async () => {
    setCreating(true);
    const name = prompt("Enter agent name:");
    if (!name) {
      setCreating(false);
      return;
    }

    const target_industry = prompt("Target industry (optional):");
    const target_role = prompt("Target role (optional):");

    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          target_industry: target_industry || null,
          target_role: target_role || null,
          daily_lead_limit: 50,
          daily_message_limit: 100,
        }),
      });
      if (res.ok) {
        fetchAgents();
      }
    } catch (error) {
      console.error("Error creating agent:", error);
    } finally {
      setCreating(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "scouting":
        return "bg-blue-500";
      case "messaging":
        return "bg-green-500";
      case "paused":
        return "bg-gray-500";
      default:
        return "bg-gray-400";
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center py-8">Loading agents...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">AI Sales Agents</h1>
          <p className="text-sm text-gray-500 mt-1">
            Autonomous agents that find, qualify, and engage leads automatically
          </p>
        </div>
        <Button onClick={createAgent} disabled={creating}>
          <Plus className="mr-2 h-4 w-4" />
          {creating ? "Creating..." : "Create AI Agent"}
        </Button>
      </div>

      {agents.length === 0 ? (
        <Card className="p-8 text-center">
          <CardContent>
            <p className="text-gray-500 mb-4">No agents yet. Create your first AI agent to get started.</p>
            <Button onClick={createAgent}>
              <Plus className="mr-2 h-4 w-4" />
              Create Agent
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {agents.map((agent) => (
            <Card key={agent.id} className="p-4">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{agent.name}</CardTitle>
                    <CardDescription className="mt-1">
                      {agent.target_industry && (
                        <span className="text-xs">{agent.target_industry}</span>
                      )}
                      {agent.target_role && (
                        <span className="text-xs ml-2">• {agent.target_role}</span>
                      )}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      className={`${getStatusColor(agent.status)} text-white text-xs`}
                    >
                      {agent.status}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Stats */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-gray-500 flex items-center gap-1">
                      <Search className="h-3 w-3" />
                      Leads Scouted
                    </div>
                    <div className="font-semibold text-lg mt-1">{agent.leads_generated}</div>
                  </div>
                  <div>
                    <div className="text-gray-500 flex items-center gap-1">
                      <Send className="h-3 w-3" />
                      Messages Sent
                    </div>
                    <div className="font-semibold text-lg mt-1">{agent.messages_sent}</div>
                  </div>
                  <div>
                    <div className="text-gray-500 flex items-center gap-1">
                      <Reply className="h-3 w-3" />
                      Replies
                    </div>
                    <div className="font-semibold text-lg mt-1">{agent.replies_received}</div>
                  </div>
                  <div>
                    <div className="text-gray-500 flex items-center gap-1">
                      <TrendingUp className="h-3 w-3" />
                      Win Rate
                    </div>
                    <div className="font-semibold text-lg mt-1">{agent.win_rate.toFixed(1)}%</div>
                  </div>
                </div>

                {/* Win Rate Progress */}
                <div>
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>Performance</span>
                    <span>{agent.win_rate.toFixed(1)}%</span>
                  </div>
                  <Progress value={agent.win_rate} max={100} />
                </div>

                {/* Autopilot Toggle */}
                <div className="flex items-center justify-between pt-2 border-t">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-yellow-500" />
                    <span className="text-sm font-medium">Autopilot Mode</span>
                  </div>
                  <Switch
                    checked={agent.autopilot_enabled}
                    onCheckedChange={(enabled) => toggleAutopilot(agent.id, enabled)}
                  />
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => triggerProspect(agent.id)}
                    disabled={agent.status !== "idle"}
                  >
                    <Search className="mr-1 h-3 w-3" />
                    Prospect
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => triggerOutreach(agent.id)}
                    disabled={agent.status !== "idle"}
                  >
                    <Send className="mr-1 h-3 w-3" />
                    Outreach
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

