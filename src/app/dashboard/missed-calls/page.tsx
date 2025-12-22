// Block 37001 — Missed Call Dashboard
// Shows missed call recovery stats, recent calls, and lead capture progress

"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Phone, PhoneOff, AlertTriangle, Clock, TrendingUp, CheckCircle2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface MissedCall {
  id: string;
  phone: string;
  call_time: string;
  processed: boolean;
  emergency: boolean;
  after_hours: boolean;
  created_lead_id: string | null;
  company_name: string | null;
}

interface Capture {
  id: string;
  missed_call_id: string;
  lead_id: string | null;
  step: string;
  value: string | null;
  message_text: string | null;
  created_at: string;
}

interface Stats {
  total_missed_calls: number;
  processed_calls: number;
  leads_created: number;
  emergency_calls: number;
  after_hours_calls: number;
  recovery_rate: number;
}

export default function MissedCallsDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentCalls, setRecentCalls] = useState<MissedCall[]>([]);
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  async function fetchStats() {
    try {
      const res = await fetch("/api/missed-calls/stats?days=30");
      const data = await res.json();
      setStats(data.stats);
      setRecentCalls(data.recent_calls || []);
      setCaptures(data.captures || []);
    } catch (error) {
      console.error("Error fetching stats:", error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center py-12">Loading missed call stats...</div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <p className="text-muted-foreground">No missed call data available.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Missed Call Recovery</h1>
        <p className="text-muted-foreground mt-2">
          See how SmartSend turns every missed call into a booked estimate
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Missed Calls</CardTitle>
            <PhoneOff className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total_missed_calls}</div>
            <p className="text-xs text-muted-foreground mt-1">Last 30 days</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Leads Created</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.leads_created}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.recovery_rate.toFixed(1)}% recovery rate
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Emergency Calls</CardTitle>
            <AlertTriangle className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.emergency_calls}</div>
            <p className="text-xs text-muted-foreground mt-1">Urgent issues detected</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">After-Hours</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.after_hours_calls}</div>
            <p className="text-xs text-muted-foreground mt-1">Captured while closed</p>
          </CardContent>
        </Card>
      </div>

      {/* Recent Missed Calls Table */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Missed Calls</CardTitle>
          <CardDescription>
            Calls that were missed and automatically texted back
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recentCalls.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No missed calls in the last 30 days
            </div>
          ) : (
            <div className="space-y-4">
              {recentCalls.map((call) => {
                const callCaptures = captures.filter((c) => c.missed_call_id === call.id);
                return (
                  <div
                    key={call.id}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Phone className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{call.phone}</span>
                        {call.emergency && (
                          <Badge variant="destructive" className="text-xs">
                            Emergency
                          </Badge>
                        )}
                        {call.after_hours && (
                          <Badge variant="outline" className="text-xs">
                            After Hours
                          </Badge>
                        )}
                        {call.processed && call.created_lead_id && (
                          <Badge variant="default" className="text-xs">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Lead Created
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(call.call_time), { addSuffix: true })}
                      </div>
                      {callCaptures.length > 0 && (
                        <div className="mt-2 text-xs text-muted-foreground">
                          {callCaptures.length} conversation step
                          {callCaptures.length !== 1 ? "s" : ""}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      {call.processed ? (
                        <Badge variant="secondary">Processed</Badge>
                      ) : (
                        <Badge variant="outline">Pending</Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recovery Rate Info */}
      <Card>
        <CardHeader>
          <CardTitle>How This Makes You Money</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <strong>Recovery Rate:</strong> {stats.recovery_rate.toFixed(1)}% of missed calls
            turned into leads
          </p>
          <p>
            <strong>Emergency Detection:</strong> {stats.emergency_calls} urgent issues caught
            instantly
          </p>
          <p>
            <strong>After-Hours Capture:</strong> {stats.after_hours_calls} leads captured while
            you were closed
          </p>
          <p className="text-muted-foreground mt-4">
            SmartSend automatically texts homeowners when you miss a call, captures their
            information via AI, and creates leads in your pipeline. Zero office staff needed.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
































