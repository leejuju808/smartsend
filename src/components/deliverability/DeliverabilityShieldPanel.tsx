"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, Shield, TrendingUp, Mail, AlertCircle } from "lucide-react";
import { getWarmupLimit } from "@/lib/deliverability/warmupCurve";

interface MailboxShieldData {
  id: string;
  email: string;
  provider: string;
  send_limit_daily: number;
  warmup_active: boolean;
  warmup_level: number;
  reputation_score: number;
  bounces_today: number;
  sends_today: number;
  last_reset: string;
  paused: boolean;
  is_active: boolean;
}

export default function DeliverabilityShieldPanel() {
  const supabase = createClientComponentClient();
  const [mailboxes, setMailboxes] = useState<MailboxShieldData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMailboxes();
  }, []);

  const loadMailboxes = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) return;

      const { data, error } = await supabase
        .from("mailboxes")
        .select("*")
        .eq("user_id", user.id)
        .order("sends_today", { ascending: false });

      if (error) {
        console.error("Error loading mailboxes:", error);
        return;
      }

      setMailboxes(data || []);
    } catch (err) {
      console.error("Error loading mailboxes:", err);
    } finally {
      setLoading(false);
    }
  };

  const getEffectiveLimit = (mailbox: MailboxShieldData): number => {
    if (mailbox.warmup_active) {
      return Math.min(mailbox.send_limit_daily, getWarmupLimit(mailbox.warmup_level));
    }
    return mailbox.send_limit_daily;
  };

  const getBounceRate = (mailbox: MailboxShieldData): number => {
    if (mailbox.sends_today === 0) return 0;
    return (mailbox.bounces_today / mailbox.sends_today) * 100;
  };

  const getReputationColor = (score: number): string => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600";
    return "text-red-600";
  };

  const getStatusBadge = (mailbox: MailboxShieldData) => {
    if (mailbox.paused) {
      return <Badge variant="destructive">PAUSED</Badge>;
    }
    if (!mailbox.is_active) {
      return <Badge variant="secondary">INACTIVE</Badge>;
    }
    const bounceRate = getBounceRate(mailbox);
    if (bounceRate > 5) {
      return <Badge variant="destructive">HIGH BOUNCE</Badge>;
    }
    return <Badge variant="default" className="bg-green-600">ACTIVE</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (mailboxes.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          No mailboxes configured. Connect a mailbox to see deliverability shield status.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-6">
        <Shield className="h-6 w-6 text-blue-600" />
        <h2 className="text-2xl font-bold">Deliverability Shield</h2>
      </div>

      <div className="grid gap-6">
        {mailboxes.map((mailbox) => {
          const effectiveLimit = getEffectiveLimit(mailbox);
          const usagePercent = effectiveLimit > 0 
            ? Math.min(100, (mailbox.sends_today / effectiveLimit) * 100)
            : 0;
          const bounceRate = getBounceRate(mailbox);
          const remaining = Math.max(0, effectiveLimit - mailbox.sends_today);

          return (
            <Card key={mailbox.id} className="border-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Mail className="h-5 w-5 text-gray-500" />
                    <div>
                      <CardTitle className="text-lg">{mailbox.email}</CardTitle>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline">{mailbox.provider}</Badge>
                        {getStatusBadge(mailbox)}
                      </div>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Warmup Status */}
                {mailbox.warmup_active && (
                  <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                    <div>
                      <div className="text-sm font-medium text-gray-700">Warmup Level</div>
                      <div className="text-lg font-semibold text-blue-700">
                        Level {mailbox.warmup_level} ({getWarmupLimit(mailbox.warmup_level)}/day)
                      </div>
                    </div>
                    <TrendingUp className="h-6 w-6 text-blue-600" />
                  </div>
                )}

                {/* Send Usage */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">
                      Sends Today: {mailbox.sends_today} / {effectiveLimit}
                    </span>
                    <span className="text-sm text-gray-500">
                      {remaining} remaining
                    </span>
                  </div>
                  <Progress value={usagePercent} className="h-2" />
                  {usagePercent >= 90 && (
                    <div className="flex items-center gap-1 mt-1 text-sm text-amber-600">
                      <AlertCircle className="h-4 w-4" />
                      <span>Approaching daily limit</span>
                    </div>
                  )}
                </div>

                {/* Reputation Score */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <div className="text-sm text-gray-600 mb-1">Reputation Score</div>
                    <div className={`text-2xl font-bold ${getReputationColor(mailbox.reputation_score)}`}>
                      {mailbox.reputation_score}/100
                    </div>
                    <div className="mt-1">
                      <Progress 
                        value={mailbox.reputation_score} 
                        className="h-1.5"
                      />
                    </div>
                  </div>

                  <div className="p-3 bg-gray-50 rounded-lg">
                    <div className="text-sm text-gray-600 mb-1">Bounce Rate</div>
                    <div className={`text-2xl font-bold ${bounceRate > 5 ? "text-red-600" : "text-gray-900"}`}>
                      {bounceRate.toFixed(1)}%
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {mailbox.bounces_today} bounces today
                    </div>
                    {bounceRate > 5 && (
                      <div className="flex items-center gap-1 mt-1 text-xs text-red-600">
                        <AlertTriangle className="h-3 w-3" />
                        <span>Above 5% threshold</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Warnings */}
                {mailbox.paused && (
                  <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <AlertTriangle className="h-5 w-5 text-red-600" />
                    <div className="text-sm text-red-800">
                      <strong>Mailbox Paused:</strong> Sending has been automatically paused due to high bounce rate or safety concerns.
                    </div>
                  </div>
                )}

                {!mailbox.paused && bounceRate > 3 && bounceRate <= 5 && (
                  <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <AlertCircle className="h-5 w-5 text-yellow-600" />
                    <div className="text-sm text-yellow-800">
                      <strong>Warning:</strong> Bounce rate is elevated. Mailbox will be paused if it exceeds 5%.
                    </div>
                  </div>
                )}

                {/* Last Reset */}
                <div className="text-xs text-gray-500 pt-2 border-t">
                  Last reset: {new Date(mailbox.last_reset).toLocaleDateString()}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}










