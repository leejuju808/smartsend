"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Bot,
  User,
  Home,
  Activity,
  Clock,
  Code,
} from "lucide-react";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

interface AuditLog {
  id: string;
  lead_id: string;
  event_type: string;
  actor_type: "system" | "user" | "homeowner";
  actor_id: string | null;
  event_data: Record<string, any>;
  created_at: string;
}

interface AuditLogViewerProps {
  leadId: string;
}

function formatTime(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatEventType(eventType: string) {
  return eventType
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function getActorIcon(actorType: string) {
  switch (actorType) {
    case "system":
      return <Bot className="h-4 w-4" />;
    case "user":
      return <User className="h-4 w-4" />;
    case "homeowner":
      return <Home className="h-4 w-4" />;
    default:
      return <Activity className="h-4 w-4" />;
  }
}

function getActorBadgeColor(actorType: string) {
  switch (actorType) {
    case "system":
      return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    case "user":
      return "bg-green-500/20 text-green-400 border-green-500/30";
    case "homeowner":
      return "bg-purple-500/20 text-purple-400 border-purple-500/30";
    default:
      return "bg-gray-500/20 text-gray-400 border-gray-500/30";
  }
}

export function AuditLogViewer({ leadId }: AuditLogViewerProps) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchLogs() {
      try {
        const supabase = createClient();
        const { data, error: fetchError } = await supabase
          .from("lead_audit_logs")
          .select("*")
          .eq("lead_id", leadId)
          .order("created_at", { ascending: false });

        if (fetchError) {
          setError(fetchError.message);
          return;
        }

        setLogs(data || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load audit logs");
      } finally {
        setLoading(false);
      }
    }

    fetchLogs();
  }, [leadId]);

  if (loading) {
    return (
      <Card className="p-4 rounded-xl bg-black/40 border border-white/10">
        <div className="text-sm text-muted-foreground">Loading audit logs...</div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-4 rounded-xl bg-black/40 border border-red-500/20">
        <div className="text-sm text-red-400">Error: {error}</div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-bold mb-1">Audit Log</h3>
        <p className="text-xs text-muted-foreground">
          System-level flight recorder — Every action, automation, and message logged here.
          This log is immutable and append-only.
        </p>
      </div>

      <Card className="p-4 rounded-xl bg-black/40 border border-white/10">
        {logs.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-8">
            No audit logs found for this lead yet.
          </div>
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {logs.map((log, idx) => (
              <div key={log.id}>
                <AuditLogItem log={log} />
                {idx < logs.length - 1 && <Separator className="my-3" />}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function AuditLogItem({ log }: { log: AuditLog }) {
  const time = formatTime(log.created_at);
  const eventTypeFormatted = formatEventType(log.event_type);

  return (
    <div className="text-sm space-y-2">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <div className={cn("p-1.5 rounded", getActorBadgeColor(log.actor_type))}>
            {getActorIcon(log.actor_type)}
          </div>
          <div>
            <div className="font-semibold capitalize">
              {eventTypeFormatted}
            </div>
            <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
              <span>Actor: {log.actor_type}</span>
              {log.actor_type === "user" && log.actor_id && (
                <span className="text-[10px] font-mono">
                  ({log.actor_id.slice(0, 8)}...)
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="text-xs text-muted-foreground flex items-center gap-1 whitespace-nowrap">
          <Clock className="h-3 w-3" />
          {time}
        </div>
      </div>

      {/* Event Data JSON */}
      {log.event_data && Object.keys(log.event_data).length > 0 && (
        <div className="mt-2">
          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
            <Code className="h-3 w-3" />
            Event Data:
          </div>
          <pre className="text-xs bg-black/20 p-2 rounded mt-1 overflow-x-auto border border-white/5 font-mono">
            {JSON.stringify(log.event_data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}









































