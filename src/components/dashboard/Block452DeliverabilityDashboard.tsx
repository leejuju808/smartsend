// Block 452 — Enhanced Deliverability Dashboard
// Shows inbox health, domain health, safety scores, auto-pause logs, and throttling status

"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle, XCircle, PauseCircle, TrendingUp, TrendingDown, Activity } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";

interface InboxHealth {
  inbox_id: string;
  inbox_email: string;
  health_score: number;
  bounce_rate: number;
  spam_rate: number;
  open_rate: number;
  reply_rate: number;
  unsubscribe_rate: number;
  last_24h_sent: number;
  last_24h_bounced: number;
  last_24h_spam: number;
  last_24h_opened: number;
  last_24h_replied: number;
  last_24h_unsubscribed: number;
  is_paused: boolean;
  pause_reason: string | null;
  paused_at: string | null;
  last_updated: string;
}

interface DomainHealth {
  domain: string;
  health_score: number;
  bounce_rate: number;
  spam_rate: number;
  open_rate: number;
  sender_count: number;
  last_24h_sent: number;
  last_24h_bounced: number;
  last_24h_spam: number;
  last_24h_opened: number;
  is_paused: boolean;
  pause_reason: string | null;
  paused_at: string | null;
  last_updated: string;
}

interface ActivityLog {
  id: string;
  created_at: string;
  type: string;
  subtype: string;
  metadata: any;
}

interface DeliverabilityAnalysis {
  send_safety_score: number;
  recommended_throttle: number;
  should_pause: boolean;
  pause_reason: string | null;
  notes: string[];
}

export function Block452DeliverabilityDashboard() {
  const [inboxHealth, setInboxHealth] = useState<InboxHealth[]>([]);
  const [domainHealth, setDomainHealth] = useState<DomainHealth[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedInbox, setSelectedInbox] = useState<string | null>(null);
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<DeliverabilityAnalysis | null>(null);
  const supabase = supabaseBrowser();

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (selectedInbox) {
      fetchAnalysis(selectedInbox, null);
    } else if (selectedDomain) {
      fetchAnalysis(null, selectedDomain);
    } else {
      setAnalysis(null);
    }
  }, [selectedInbox, selectedDomain]);

  async function fetchData() {
    try {
      // Fetch inbox health
      const { data: inboxData, error: inboxError } = await supabase
        .from("inbox_health")
        .select(`
          *,
          sender_inboxes!inner(email, workspace_id)
        `)
        .order("health_score", { ascending: true });

      if (!inboxError && inboxData) {
        const inboxes = inboxData.map((ih: any) => ({
          ...ih,
          inbox_email: ih.sender_inboxes?.email || "Unknown",
        }));
        setInboxHealth(inboxes);
      }

      // Fetch domain health
      const { data: domainData, error: domainError } = await supabase
        .from("domain_health")
        .select("*")
        .order("health_score", { ascending: true });

      if (!domainError && domainData) {
        setDomainHealth(domainData);
      }

      // Fetch recent deliverability activity logs
      const { data: activityData, error: activityError } = await supabase
        .from("workspace_activity")
        .select("*")
        .eq("type", "deliverability")
        .order("created_at", { ascending: false })
        .limit(20);

      if (!activityError && activityData) {
        setActivityLogs(activityData);
      }
    } catch (error) {
      console.error("Error fetching deliverability data:", error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchAnalysis(inboxId: string | null, domain: string | null) {
    try {
      const response = await fetch("/api/v1/deliverability-analyzer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inbox_id: inboxId,
          domain: domain,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setAnalysis(data);
      }
    } catch (error) {
      console.error("Error fetching analysis:", error);
    }
  }

  function getHealthColor(score: number): string {
    if (score < 30) return "text-red-600 bg-red-50 border-red-200";
    if (score < 50) return "text-orange-600 bg-orange-50 border-orange-200";
    if (score < 80) return "text-yellow-600 bg-yellow-50 border-yellow-200";
    return "text-green-600 bg-green-50 border-green-200";
  }

  function getHealthIcon(score: number, isPaused: boolean) {
    if (isPaused) return <PauseCircle className="h-5 w-5 text-red-600" />;
    if (score < 30) return <XCircle className="h-5 w-5 text-red-600" />;
    if (score < 50) return <AlertTriangle className="h-5 w-5 text-orange-600" />;
    if (score < 80) return <AlertTriangle className="h-5 w-5 text-yellow-600" />;
    return <CheckCircle className="h-5 w-5 text-green-600" />;
  }

  if (loading) {
    return (
      <div className="border rounded-lg p-6 bg-gray-50">
        <div className="text-sm text-gray-500">Loading deliverability data...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Deliverability Engine v1</h2>
          <p className="text-sm text-gray-600 mt-1">
            Monitor inbox and domain health, safety scores, and auto-pause status
          </p>
        </div>
        <button
          onClick={fetchData}
          className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          <Activity className="h-4 w-4 mr-2" />
          Refresh
        </button>
      </div>

      {/* Safety Score Analysis */}
      {analysis && (
        <div className={`border rounded-lg p-6 ${getHealthColor(analysis.send_safety_score)}`}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold">Send Safety Score</h3>
              <p className="text-sm opacity-75">
                {selectedInbox ? "Inbox Analysis" : selectedDomain ? "Domain Analysis" : "Overall Analysis"}
              </p>
            </div>
            <div className="text-right">
              <div className="text-4xl font-bold">{analysis.send_safety_score}</div>
              <div className="text-sm opacity-75">/ 100</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-4">
            <div>
              <div className="text-sm opacity-75">Recommended Throttle</div>
              <div className="text-xl font-semibold">{analysis.recommended_throttle} emails/hour</div>
            </div>
            <div>
              <div className="text-sm opacity-75">Status</div>
              <div className="text-xl font-semibold">
                {analysis.should_pause ? (
                  <span className="text-red-600">Paused</span>
                ) : (
                  <span className="text-green-600">Active</span>
                )}
              </div>
            </div>
          </div>

          {analysis.pause_reason && (
            <div className="mt-4 p-3 bg-red-100 rounded border border-red-200">
              <div className="text-sm font-medium text-red-800">Pause Reason:</div>
              <div className="text-sm text-red-700">{analysis.pause_reason}</div>
            </div>
          )}

          {analysis.notes.length > 0 && (
            <div className="mt-4">
              <div className="text-sm font-medium mb-2">AI Notes:</div>
              <ul className="list-disc list-inside space-y-1 text-sm">
                {analysis.notes.map((note, idx) => (
                  <li key={idx}>{note}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Inbox Health Cards */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Inbox Health</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {inboxHealth.map((inbox) => (
            <div
              key={inbox.inbox_id}
              className={`border rounded-lg p-4 cursor-pointer hover:shadow-md transition-shadow ${
                selectedInbox === inbox.inbox_id ? "ring-2 ring-blue-500" : ""
              } ${getHealthColor(inbox.health_score)}`}
              onClick={() => setSelectedInbox(inbox.inbox_id)}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="font-semibold text-sm truncate">{inbox.inbox_email}</div>
                {getHealthIcon(inbox.health_score, inbox.is_paused)}
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span>Health Score:</span>
                  <span className="font-semibold">{inbox.health_score}/100</span>
                </div>
                <div className="flex justify-between">
                  <span>Bounce Rate:</span>
                  <span>{(inbox.bounce_rate * 100).toFixed(2)}%</span>
                </div>
                <div className="flex justify-between">
                  <span>Spam Rate:</span>
                  <span>{(inbox.spam_rate * 100).toFixed(3)}%</span>
                </div>
                <div className="flex justify-between">
                  <span>Open Rate:</span>
                  <span>{(inbox.open_rate * 100).toFixed(1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span>Sent (24h):</span>
                  <span>{inbox.last_24h_sent}</span>
                </div>
              </div>

              {inbox.is_paused && (
                <div className="mt-3 pt-3 border-t border-red-200">
                  <div className="text-xs font-medium text-red-800">Paused</div>
                  <div className="text-xs text-red-700">{inbox.pause_reason || "Auto-paused"}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Domain Health Cards */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Domain Health</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {domainHealth.map((domain) => (
            <div
              key={domain.domain}
              className={`border rounded-lg p-4 cursor-pointer hover:shadow-md transition-shadow ${
                selectedDomain === domain.domain ? "ring-2 ring-blue-500" : ""
              } ${getHealthColor(domain.health_score)}`}
              onClick={() => setSelectedDomain(domain.domain)}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="font-semibold text-sm">{domain.domain}</div>
                {getHealthIcon(domain.health_score, domain.is_paused)}
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span>Health Score:</span>
                  <span className="font-semibold">{domain.health_score}/100</span>
                </div>
                <div className="flex justify-between">
                  <span>Bounce Rate:</span>
                  <span>{(domain.bounce_rate * 100).toFixed(2)}%</span>
                </div>
                <div className="flex justify-between">
                  <span>Spam Rate:</span>
                  <span>{(domain.spam_rate * 100).toFixed(3)}%</span>
                </div>
                <div className="flex justify-between">
                  <span>Open Rate:</span>
                  <span>{(domain.open_rate * 100).toFixed(1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span>Senders:</span>
                  <span>{domain.sender_count}</span>
                </div>
                <div className="flex justify-between">
                  <span>Sent (24h):</span>
                  <span>{domain.last_24h_sent}</span>
                </div>
              </div>

              {domain.is_paused && (
                <div className="mt-3 pt-3 border-t border-red-200">
                  <div className="text-xs font-medium text-red-800">Paused</div>
                  <div className="text-xs text-red-700">{domain.pause_reason || "Auto-paused"}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Activity Logs */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Recent Deliverability Events</h3>
        <div className="border rounded-lg overflow-hidden">
          <div className="divide-y divide-gray-200">
            {activityLogs.length === 0 ? (
              <div className="p-4 text-sm text-gray-500 text-center">No recent events</div>
            ) : (
              activityLogs.map((log) => (
                <div key={log.id} className="p-4 hover:bg-gray-50">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900">
                        {log.subtype === "inbox_paused" && "Inbox Auto-Paused"}
                        {log.subtype === "domain_paused" && "Domain Auto-Paused"}
                        {log.subtype === "send_blocked" && "Send Blocked"}
                        {log.subtype === "throttle_adjusted" && "Throttle Adjusted"}
                        {!["inbox_paused", "domain_paused", "send_blocked", "throttle_adjusted"].includes(log.subtype) && log.subtype}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {log.metadata?.inbox_email && `Inbox: ${log.metadata.inbox_email}`}
                        {log.metadata?.domain && `Domain: ${log.metadata.domain}`}
                        {log.metadata?.reason && `Reason: ${log.metadata.reason}`}
                      </div>
                    </div>
                    <div className="text-xs text-gray-400">
                      {new Date(log.created_at).toLocaleString()}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}



