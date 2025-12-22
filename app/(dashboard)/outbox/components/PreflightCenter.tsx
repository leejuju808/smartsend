"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type PreflightHold = {
  id: string;
  to_email?: string;
  to?: string;
  subject?: string;
  preflight_score: number;
  preflight_reasons: string[];
  held_at: string;
  account_id: string;
  campaign_id?: string;
};

const REASON_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  too_many_links: { label: "Too Many Links", variant: "secondary" },
  short_url_detected: { label: "Short URL", variant: "secondary" },
  spam_phrase: { label: "Spam Phrase", variant: "destructive" },
  all_caps_subject: { label: "All Caps Subject", variant: "secondary" },
  no_unsubscribe: { label: "No Unsubscribe", variant: "secondary" },
  domain_blocklisted: { label: "Blocked Domain", variant: "destructive" },
  domain_unhealthy: { label: "Unhealthy Domain", variant: "destructive" },
  warmup_gate: { label: "Warmup Gate", variant: "secondary" },
  too_long: { label: "Too Long", variant: "secondary" },
  too_short: { label: "Too Short", variant: "secondary" },
  missing_from: { label: "Missing From", variant: "destructive" },
};

export default function PreflightCenter() {
  const [holds, setHolds] = useState<PreflightHold[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedHold, setSelectedHold] = useState<PreflightHold | null>(null);
  const [details, setDetails] = useState<any>(null);
  const [releasing, setReleasing] = useState(false);

  const loadHolds = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("send_queue")
        .select("id, to_email, to, subject, preflight_score, preflight_reasons, held_at, account_id, campaign_id")
        .eq("status", "held_preflight")
        .order("held_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      setHolds(data || []);
    } catch (err) {
      console.error("Error loading holds:", err);
      toast.error("Failed to load preflight holds");
    } finally {
      setLoading(false);
    }
  };

  const loadDetails = async (queueId: string) => {
    try {
      const { data, error } = await supabase
        .from("preflight_results")
        .select("*")
        .eq("queue_id", queueId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (error) throw error;
      setDetails(data);
    } catch (err) {
      console.error("Error loading details:", err);
      toast.error("Failed to load details");
    }
  };

  const releaseEmail = async (queueId: string) => {
    setReleasing(true);
    try {
      const res = await fetch("/api/preflight/release", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queueId }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to release");
      }

      toast.success("Email released and will be sent");
      setSelectedHold(null);
      loadHolds();
    } catch (err: any) {
      console.error("Release error:", err);
      toast.error(err.message || "Failed to release email");
    } finally {
      setReleasing(false);
    }
  };

  const addToAllowlist = async (domain: string, accountId: string) => {
    try {
      const { error } = await supabase
        .from("preflight_rules")
        .insert({
          account_id: accountId,
          kind: "allow_link_domain",
          value: domain,
        });

      if (error) throw error;
      toast.success(`Added ${domain} to allowlist`);
    } catch (err: any) {
      console.error("Allowlist error:", err);
      toast.error(err.message || "Failed to add to allowlist");
    }
  };

  const addToBlocklist = async (domain: string, accountId: string) => {
    try {
      const { error } = await supabase
        .from("preflight_rules")
        .insert({
          account_id: accountId,
          kind: "block_link_domain",
          value: domain,
        });

      if (error) throw error;
      toast.success(`Added ${domain} to blocklist`);
    } catch (err: any) {
      console.error("Blocklist error:", err);
      toast.error(err.message || "Failed to add to blocklist");
    }
  };

  const toggleWarmup = async (accountId: string, enabled: boolean) => {
    try {
      const { error } = await supabase
        .from("account_warmup_profiles")
        .upsert({
          account_id: accountId,
          enabled: !enabled,
        }, {
          onConflict: "account_id",
        });

      if (error) throw error;
      toast.success(`Warmup ${!enabled ? "enabled" : "disabled"}`);
    } catch (err: any) {
      console.error("Warmup toggle error:", err);
      toast.error(err.message || "Failed to toggle warmup");
    }
  };

  useEffect(() => {
    loadHolds();
  }, []);

  useEffect(() => {
    if (selectedHold) {
      loadDetails(selectedHold.id);
    }
  }, [selectedHold]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Preflight Holds</h2>
          <p className="text-sm text-muted-foreground">
            Emails held for review before sending
          </p>
        </div>
        <Button onClick={loadHolds} variant="outline" disabled={loading}>
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      ) : holds.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          No emails held for preflight review
        </div>
      ) : (
        <div className="rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-3 text-left">To</th>
                <th className="px-4 py-3 text-left">Subject</th>
                <th className="px-4 py-3 text-left">Score</th>
                <th className="px-4 py-3 text-left">Reasons</th>
                <th className="px-4 py-3 text-left">Held At</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {holds.map((hold) => (
                <tr key={hold.id} className="border-t hover:bg-muted/50">
                  <td className="px-4 py-3">{hold.to_email || hold.to || "—"}</td>
                  <td className="px-4 py-3">{hold.subject || "—"}</td>
                  <td className="px-4 py-3">
                    <Badge variant={hold.preflight_score >= 70 ? "default" : hold.preflight_score >= 40 ? "secondary" : "destructive"}>
                      {hold.preflight_score}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(hold.preflight_reasons || []).map((reason) => {
                        const meta = REASON_LABELS[reason] || { label: reason, variant: "outline" as const };
                        return (
                          <Badge key={reason} variant={meta.variant} className="text-xs">
                            {meta.label}
                          </Badge>
                        );
                      })}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {hold.held_at ? new Date(hold.held_at).toLocaleString() : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSelectedHold(hold)}
                    >
                      Review
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={!!selectedHold} onOpenChange={(open) => !open && setSelectedHold(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Preflight Review</DialogTitle>
            <DialogDescription>
              Review details and take action on this held email
            </DialogDescription>
          </DialogHeader>

          {selectedHold && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm font-medium text-muted-foreground">To</div>
                  <div>{selectedHold.to_email || selectedHold.to || "—"}</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-muted-foreground">Score</div>
                  <Badge variant={selectedHold.preflight_score >= 70 ? "default" : selectedHold.preflight_score >= 40 ? "secondary" : "destructive"}>
                    {selectedHold.preflight_score}
                  </Badge>
                </div>
              </div>

              <div>
                <div className="text-sm font-medium text-muted-foreground mb-2">Subject</div>
                <div className="p-2 bg-muted rounded">{selectedHold.subject || "—"}</div>
              </div>

              <div>
                <div className="text-sm font-medium text-muted-foreground mb-2">Reasons</div>
                <div className="flex flex-wrap gap-2">
                  {(selectedHold.preflight_reasons || []).map((reason) => {
                    const meta = REASON_LABELS[reason] || { label: reason, variant: "outline" as const };
                    return (
                      <Badge key={reason} variant={meta.variant}>
                        {meta.label}
                      </Badge>
                    );
                  })}
                </div>
              </div>

              {details && (
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-2">Details</div>
                  <div className="p-3 bg-muted rounded text-sm space-y-1">
                    {details.details?.links !== undefined && (
                      <div>Links: {details.details.links}</div>
                    )}
                    {details.details?.sent_today !== undefined && (
                      <div>Sent Today: {details.details.sent_today}</div>
                    )}
                    {details.details?.ramp_limit !== undefined && (
                      <div>Ramp Limit: {details.details.ramp_limit}</div>
                    )}
                  </div>
                </div>
              )}

              <div className="border-t pt-4 space-y-2">
                <div className="text-sm font-medium">Quick Actions</div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => toggleWarmup(selectedHold.account_id, true)}
                  >
                    Toggle Warmup
                  </Button>
                  {details?.details?.links > 0 && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          // Extract domain from details if available
                          const domain = prompt("Enter domain to allowlist:");
                          if (domain) addToAllowlist(domain, selectedHold.account_id);
                        }}
                      >
                        Allow Domain
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const domain = prompt("Enter domain to blocklist:");
                          if (domain) addToBlocklist(domain, selectedHold.account_id);
                        }}
                      >
                        Block Domain
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setSelectedHold(null)}
            >
              Close
            </Button>
            <Button
              onClick={() => selectedHold && releaseEmail(selectedHold.id)}
              disabled={releasing}
            >
              {releasing ? "Releasing..." : "Release Anyway"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}














