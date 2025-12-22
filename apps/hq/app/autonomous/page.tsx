"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { Button, Card } from "@aurev/ui";

interface AutonomousAction {
  id: string;
  org_id: string;
  action: "trigger_workflow" | "launch_campaign" | "deploy_agent";
  target: string;
  confidence: number;
  executed: boolean;
  created_at: string;
}

async function fetchAutonomous(): Promise<AutonomousAction[]> {
  const res = await fetch("/api/autonomous");
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
}

async function executeAction(id: string): Promise<void> {
  const res = await fetch("/api/autonomous/execute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Failed to execute");
  }
  return res.json();
}

export default function AutonomousBoard() {
  const { data, error, isLoading, mutate } = useSWR<AutonomousAction[]>(
    "/api/autonomous",
    fetchAutonomous,
    { refreshInterval: 30000 } // Refresh every 30 seconds
  );

  const [executing, setExecuting] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleExecute = async (action: AutonomousAction) => {
    if (executing.has(action.id)) return;

    setExecuting((prev) => new Set(prev).add(action.id));
    setMessage(null);

    try {
      await executeAction(action.id);
      setMessage({ type: "success", text: "Action executed successfully!" });
      // Refresh the list
      setTimeout(() => {
        mutate();
        setMessage(null);
      }, 1000);
    } catch (err) {
      setMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to execute action",
      });
    } finally {
      setExecuting((prev) => {
        const next = new Set(prev);
        next.delete(action.id);
        return next;
      });
    }
  };

  const getActionLabel = (action: string) => {
    switch (action) {
      case "trigger_workflow":
        return "Trigger Workflow";
      case "launch_campaign":
        return "Launch Campaign";
      case "deploy_agent":
        return "Deploy Agent";
      default:
        return action;
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return "text-green-400";
    if (confidence >= 0.6) return "text-yellow-400";
    return "text-orange-400";
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">Loading AI suggestions...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-red-400">Error loading suggestions</p>
      </div>
    );
  }

  const actions = data || [];

  return (
    <div className="min-h-screen p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-white mb-2">Autonomous Enterprise Dashboard</h1>
        <p className="text-gray-400">
          AI-powered suggestions for automations, campaigns, and agents
        </p>
      </div>

      {message && (
        <div
          className={`mb-6 p-4 rounded-xl ${
            message.type === "success" ? "bg-green-900/30 border border-green-700" : "bg-red-900/30 border border-red-700"
          }`}
        >
          <p className={message.type === "success" ? "text-green-400" : "text-red-400"}>
            {message.text}
          </p>
        </div>
      )}

      {actions.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-gray-400 mb-4">No AI suggestions available yet.</p>
          <p className="text-sm text-gray-500">
            The autonomous orchestrator will analyze your org activity and suggest actions.
          </p>
        </Card>
      ) : (
        <div className="grid md:grid-cols-3 gap-6">
          {actions.map((action) => (
            <Card key={action.id} className="p-6">
              <div className="mb-4">
                <h3 className="font-semibold text-white text-lg mb-1">
                  {getActionLabel(action.action)}
                </h3>
                <p className="text-sm text-gray-300 mb-2">→ {action.target}</p>
                <p className={`text-sm font-medium ${getConfidenceColor(action.confidence)}`}>
                  Confidence: {(action.confidence * 100).toFixed(0)}%
                </p>
              </div>
              <Button
                onClick={() => handleExecute(action)}
                disabled={executing.has(action.id) || action.executed}
                size="sm"
                variant={action.executed ? "ghost" : "primary"}
              >
                {executing.has(action.id)
                  ? "Executing..."
                  : action.executed
                  ? "Executed"
                  : "Approve & Run"}
              </Button>
              {action.executed && (
                <p className="text-xs text-gray-500 mt-2">Executed</p>
              )}
            </Card>
          ))}
        </div>
      )}

      <div className="mt-8 p-4 bg-surface border border-gray-800 rounded-xl">
        <h3 className="text-lg font-semibold text-white mb-2">How It Works</h3>
        <p className="text-sm text-gray-400 mb-4">
          The autonomous orchestrator analyzes your organization's usage patterns and suggests
          automations, campaigns, and agents to deploy. Each suggestion includes a confidence score
          based on AI analysis of your team's behavior and activity data.
        </p>
        <div className="grid md:grid-cols-3 gap-4 text-sm">
          <div className="flex items-start gap-2">
            <span className="w-2 h-2 bg-green-400 rounded-full mt-2"></span>
            <div>
              <span className="text-white font-medium">High Confidence (80%+)</span>
              <p className="text-gray-400">Strong recommendation based on clear patterns</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-2 h-2 bg-yellow-400 rounded-full mt-2"></span>
            <div>
              <span className="text-white font-medium">Medium Confidence (60-79%)</span>
              <p className="text-gray-400">Good recommendation, worth reviewing</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <span className="w-2 h-2 bg-orange-400 rounded-full mt-2"></span>
            <div>
              <span className="text-white font-medium">Lower Confidence (&lt;60%)</span>
              <p className="text-gray-400">Suggestion based on limited data</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

