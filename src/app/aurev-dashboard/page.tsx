"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { AUREVSDK } from "@/lib/aurev-sdk";
import { Zap, Workflow, Bot } from "lucide-react";
import Link from "next/link";

export default function AUREVDashboard() {
  const [metrics, setMetrics] = useState<any>(null);
  const [modules, setModules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [metricsData, modulesData] = await Promise.all([
          AUREVSDK.analytics.getDashboardMetrics(),
          AUREVSDK.analytics.getModuleUsage(),
        ]);
        setMetrics(metricsData);
        setModules(modulesData);
      } catch (error) {
        console.error("Failed to fetch AUREV data:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading AUREV OS...</div>
      </div>
    );
  }

  // Calculate progress percentages based on module usage
  const getModuleProgress = (moduleName: string) => {
    const module = modules.find((m) => m.module === moduleName);
    if (!module || !module.usage) return 0;

    switch (moduleName) {
      case "smartsend":
        const smartsendSends = metrics?.smartsend_sends || 0;
        return Math.min((smartsendSends / 10000) * 100, 100); // Normalize to 10k sends
      case "opsgrid":
        const workflowsRun = metrics?.opsgrid_workflows || 0;
        return Math.min((workflowsRun / 1000) * 100, 100); // Normalize to 1k workflows
      case "agentcloud":
        const agentsDeployed = metrics?.agentcloud_agents || 0;
        return Math.min((agentsDeployed / 100) * 100, 100); // Normalize to 100 agents
      default:
        return 0;
    }
  };

  const getModuleIcon = (moduleName: string) => {
    switch (moduleName) {
      case "smartsend":
        return <Zap className="h-6 w-6" />;
      case "opsgrid":
        return <Workflow className="h-6 w-6" />;
      case "agentcloud":
        return <Bot className="h-6 w-6" />;
      default:
        return null;
    }
  };

  const getModuleDisplayName = (moduleName: string) => {
    switch (moduleName) {
      case "smartsend":
        return "SmartSend AI";
      case "opsgrid":
        return "OpsGrid";
      case "agentcloud":
        return "AgentCloud";
      default:
        return moduleName;
    }
  };

  const getModuleSubtitle = (moduleName: string) => {
    switch (moduleName) {
      case "smartsend":
        return `Campaigns running: ${metrics?.smartsend_sends || 0}`;
      case "opsgrid":
        return `Active workflows: ${metrics?.opsgrid_workflows || 0}`;
      case "agentcloud":
        return `Agents deployed: ${metrics?.agentcloud_agents || 0}`;
      default:
        return "";
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-gray-950 to-black text-white p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-yellow-400 to-yellow-600 bg-clip-text text-transparent">
            AUREV OS
          </h1>
          <p className="text-xl text-gray-400">
            The AI Operating System for Builders
          </p>
        </div>

        {/* Core Stats Grid */}
        <div className="grid md:grid-cols-3 gap-6">
          {modules.map((module) => (
            <Card
              key={module.id}
              className="p-6 bg-gray-900/50 border-gray-800 hover:border-yellow-500/50 transition-colors"
            >
              <div className="flex items-center space-x-3 mb-4">
                <div className="text-yellow-500">
                  {getModuleIcon(module.module)}
                </div>
                <h2 className="text-xl font-semibold text-white">
                  {getModuleDisplayName(module.module)}
                </h2>
              </div>
              <p className="text-gray-400 mb-4">
                {getModuleSubtitle(module.module)}
              </p>
              <Progress
                value={getModuleProgress(module.module)}
                className="h-2"
              />
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-gray-500">
                  {module.status === "active" ? "Active" : "Inactive"}
                </span>
                <span className="text-yellow-500 font-medium">
                  {Math.round(getModuleProgress(module.module))}%
                </span>
              </div>
            </Card>
          ))}
        </div>

        {/* Unified Analytics */}
        {metrics && (
          <div className="grid md:grid-cols-2 gap-6">
            <Card className="p-6 bg-gray-900/50 border-gray-800">
              <h3 className="text-lg font-semibold mb-4 text-white">
                Unified Metrics
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-400">Total Events</span>
                  <span className="text-yellow-500 font-bold">
                    {metrics.total_events}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Revenue (USD)</span>
                  <span className="text-green-500 font-bold">
                    ${metrics.total_revenue.toFixed(2)}
                  </span>
                </div>
              </div>
            </Card>

            <Card className="p-6 bg-gray-900/50 border-gray-800">
              <h3 className="text-lg font-semibold mb-4 text-white">
                Quick Actions
              </h3>
              <div className="space-y-2">
                <Link
                  href="/dashboard"
                  className="block p-3 bg-gray-800 hover:bg-yellow-500/20 border border-gray-700 hover:border-yellow-500/50 rounded-md transition-colors"
                >
                  <div className="flex items-center space-x-2">
                    <Zap className="h-4 w-4 text-yellow-500" />
                    <span className="text-white">Open SmartSend</span>
                  </div>
                </Link>
                <button
                  disabled
                  className="block w-full p-3 bg-gray-800 opacity-50 cursor-not-allowed border border-gray-700 rounded-md"
                >
                  <div className="flex items-center space-x-2">
                    <Workflow className="h-4 w-4 text-gray-500" />
                    <span className="text-gray-500">Coming: OpsGrid</span>
                  </div>
                </button>
                <button
                  disabled
                  className="block w-full p-3 bg-gray-800 opacity-50 cursor-not-allowed border border-gray-700 rounded-md"
                >
                  <div className="flex items-center space-x-2">
                    <Bot className="h-4 w-4 text-gray-500" />
                    <span className="text-gray-500">Coming: AgentCloud</span>
                  </div>
                </button>
              </div>
            </Card>
          </div>
        )}

        {/* Module Details */}
        <Card className="p-6 bg-gray-900/50 border-gray-800">
          <h3 className="text-lg font-semibold mb-4 text-white">
            Module Status
          </h3>
          <div className="space-y-4">
            {modules.map((module) => (
              <div
                key={module.id}
                className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg border border-gray-700"
              >
                <div className="flex items-center space-x-3">
                  {getModuleIcon(module.module)}
                  <div>
                    <p className="font-medium text-white">
                      {getModuleDisplayName(module.module)}
                    </p>
                    <p className="text-sm text-gray-400">
                      {module.status === "active"
                        ? "Fully operational"
                        : "Not enabled"}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span
                    className={`px-3 py-1 rounded-full text-sm font-medium ${
                      module.status === "active"
                        ? "bg-green-500/20 text-green-400 border border-green-500/50"
                        : "bg-gray-500/20 text-gray-400 border border-gray-500/50"
                    }`}
                  >
                    {module.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Footer */}
        <div className="text-center text-gray-500 text-sm mt-8">
          <p>AUREV OS v1.0 • Powered by SmartSend AI</p>
        </div>
      </div>
    </div>
  );
}

