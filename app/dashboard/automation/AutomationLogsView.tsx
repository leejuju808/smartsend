"use client";

// Block 75000 — Automation Logs View Component

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/Button";
import { X } from "lucide-react";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";

interface AutomationLog {
  id: string;
  rule_id: string | null;
  trigger_type: string;
  trigger_entity_id: string | null;
  trigger_entity_type: string | null;
  outcome: "executed" | "skipped" | "failed";
  details: Record<string, any>;
  created_at: string;
  automation_rules?: {
    id: string;
    name: string;
    trigger_type: string;
    action_type: string;
  } | null;
}

export function AutomationLogsView({
  workspaceId,
  onClose,
}: {
  workspaceId: string;
  onClose: () => void;
}) {
  const [logs, setLogs] = useState<AutomationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterOutcome, setFilterOutcome] = useState<string>("all");
  const [filterRuleId, setFilterRuleId] = useState<string>("all");

  useEffect(() => {
    fetchLogs();
  }, [workspaceId, filterOutcome, filterRuleId]);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filterOutcome !== "all") {
        params.append("outcome", filterOutcome);
      }
      if (filterRuleId !== "all") {
        params.append("rule_id", filterRuleId);
      }
      params.append("limit", "50");

      const response = await fetch(`/api/automation/logs?${params}`);
      if (!response.ok) throw new Error("Failed to fetch logs");
      const data = await response.json();
      setLogs(data.logs || []);
    } catch (error: any) {
      console.error("Error fetching logs:", error);
    } finally {
      setLoading(false);
    }
  };

  const getOutcomeColor = (outcome: string) => {
    switch (outcome) {
      case "executed":
        return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
      case "skipped":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
      case "failed":
        return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Automation Execution Logs</DialogTitle>
          <DialogDescription>
            See what automations have run and their outcomes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Filters */}
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Select value={filterOutcome} onValueChange={setFilterOutcome}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by outcome" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Outcomes</SelectItem>
                  <SelectItem value="executed">Executed</SelectItem>
                  <SelectItem value="skipped">Skipped</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Logs List */}
          {loading ? (
            <div className="flex items-center justify-center p-12">
              <div className="text-muted-foreground">Loading logs...</div>
            </div>
          ) : logs.length === 0 ? (
            <div className="border rounded-lg p-12 text-center">
              <p className="text-muted-foreground">No automation logs yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="border rounded-lg p-4 hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span
                          className={`px-2 py-1 text-xs rounded-full ${getOutcomeColor(
                            log.outcome
                          )}`}
                        >
                          {log.outcome.toUpperCase()}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {log.automation_rules?.name || "Unknown Rule"}
                        </span>
                      </div>
                      <div className="text-sm space-y-1">
                        <div>
                          <span className="text-muted-foreground">Trigger: </span>
                          <span className="font-medium">{log.trigger_type}</span>
                        </div>
                        {log.automation_rules && (
                          <div>
                            <span className="text-muted-foreground">Action: </span>
                            <span className="font-medium">
                              {log.automation_rules.action_type}
                            </span>
                          </div>
                        )}
                        {log.details?.reason && (
                          <div>
                            <span className="text-muted-foreground">Reason: </span>
                            <span>{log.details.reason}</span>
                          </div>
                        )}
                        {log.details?.error && (
                          <div className="text-red-600 dark:text-red-400">
                            <span className="text-muted-foreground">Error: </span>
                            <span>{log.details.error}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(log.created_at)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}



























