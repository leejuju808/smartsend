"use client";

import { useState, useEffect } from "react";
import { Phone, PhoneIncoming, PhoneOutgoing, Clock, User } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { LogCallModal } from "./LogCallModal";

interface CallLog {
  id: string;
  phone: string;
  direction: "inbound" | "outbound";
  outcome: string;
  notes: string | null;
  follow_up_at: string | null;
  created_at: string;
  user: {
    id: string;
    email: string;
    name: string;
  } | null;
}

interface CallActivityProps {
  contactId: string;
  contactPhone?: string | null;
}

export function CallActivity({ contactId, contactPhone }: CallActivityProps) {
  const [callLogs, setCallLogs] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [logCallModalOpen, setLogCallModalOpen] = useState(false);

  useEffect(() => {
    loadCallLogs();
  }, [contactId]);

  const loadCallLogs = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/call-log/contact/${contactId}`);
      const json = await res.json();
      if (res.ok && json.callLogs) {
        setCallLogs(json.callLogs);
      }
    } catch (error) {
      console.error("Failed to load call logs:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCallLogged = () => {
    loadCallLogs();
    setLogCallModalOpen(false);
  };

  const getOutcomeColor = (outcome: string) => {
    switch (outcome) {
      case "talked":
        return "text-green-500";
      case "scheduled_inspection":
        return "text-blue-500";
      case "estimate_discussed":
        return "text-purple-500";
      case "missed":
        return "text-red-500";
      case "no_answer":
        return "text-yellow-500";
      case "left_voicemail":
        return "text-orange-500";
      case "declined":
        return "text-gray-500";
      default:
        return "text-gray-400";
    }
  };

  const formatOutcome = (outcome: string) => {
    return outcome
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-300">Call Activity</h3>
        <Button
          onClick={() => setLogCallModalOpen(true)}
          size="sm"
          variant="outline"
          className="text-xs"
        >
          <Phone className="h-3 w-3 mr-1" />
          Log Call
        </Button>
      </div>

      {loading ? (
        <div className="text-sm text-zinc-500">Loading calls...</div>
      ) : callLogs.length === 0 ? (
        <div className="text-sm text-zinc-500 py-4 text-center">
          No calls logged yet
        </div>
      ) : (
        <div className="space-y-3">
          {callLogs.map((log) => (
            <div
              key={log.id}
              className="border border-zinc-800 rounded-lg p-3 space-y-2 bg-zinc-900/50"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  {log.direction === "inbound" ? (
                    <PhoneIncoming className="h-4 w-4 text-blue-500" />
                  ) : (
                    <PhoneOutgoing className="h-4 w-4 text-green-500" />
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-zinc-200">
                        {log.direction === "inbound" ? "Inbound" : "Outbound"}
                      </span>
                      <span className={`text-xs ${getOutcomeColor(log.outcome)}`}>
                        {formatOutcome(log.outcome)}
                      </span>
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5">
                      {log.phone}
                    </div>
                  </div>
                </div>
                <div className="text-xs text-zinc-500">
                  {formatDate(log.created_at)}
                </div>
              </div>

              {log.notes && (
                <div className="text-sm text-zinc-400 mt-2 pl-6">
                  {log.notes}
                </div>
              )}

              {log.follow_up_at && (
                <div className="flex items-center gap-1 text-xs text-zinc-500 mt-2 pl-6">
                  <Clock className="h-3 w-3" />
                  Follow-up: {new Date(log.follow_up_at).toLocaleString()}
                </div>
              )}

              {log.user && (
                <div className="flex items-center gap-1 text-xs text-zinc-500 mt-1 pl-6">
                  <User className="h-3 w-3" />
                  {log.user.name}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <LogCallModal
        open={logCallModalOpen}
        onClose={() => setLogCallModalOpen(false)}
        onCallLogged={handleCallLogged}
        contactId={contactId}
        defaultPhone={contactPhone || undefined}
      />
    </div>
  );
}



























































