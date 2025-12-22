"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/Card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/Button";
import { Textarea } from "@/components/ui/Textarea";
import { ShieldAlert, Lock, Unlock, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type GuardrailEvent = {
  id: string;
  org_id: string | null;
  lead_id: string | null;
  email_domain: string | null;
  guardrail_type: string;
  message: string;
  context: any;
  created_at: string;
};

export function GuardrailCenter({
  orgId,
  initialEvents,
  settings,
}: {
  orgId: string;
  initialEvents: GuardrailEvent[];
  settings: any;
}) {
  const [events, setEvents] = useState(initialEvents);
  const [locked, setLocked] = useState<boolean>(
    !!settings?.autopilot_locked,
  );
  const [reason, setReason] = useState<string>(
    settings?.autopilot_locked_reason || "",
  );
  const [saving, setSaving] = useState(false);

  const handleLockToggle = async (lock: boolean) => {
    setSaving(true);
    try {
      const res = await fetch("/api/sdr-guardrails/lock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_id: orgId,
          lock,
          reason: lock ? reason || "manual_lock" : null,
        }),
      });

      if (!res.ok) throw new Error("Failed");

      setLocked(lock);
      // Optionally refetch events; or just optimistic append
    } catch (err) {
      console.error(err);
      alert("Failed to update lock state");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 p-6">
      {/* Header & lock controls */}
      <Card className="flex flex-col gap-3 p-4 text-xs md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-red-500" />
          <div>
            <h1 className="text-sm font-semibold">
              AI SDR Guardrail Center
            </h1>
            <p className="text-[11px] text-muted-foreground">
              Daily caps, locks, and safety events for your AI SDR autopilot.
            </p>
          </div>
        </div>
        <div className="flex flex-1 flex-col items-stretch gap-2 md:max-w-md">
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={cn(
                locked
                  ? "border-red-500/40 bg-red-500/10 text-red-500"
                  : "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
              )}
            >
              {locked ? "Autopilot locked" : "Autopilot active"}
            </Badge>
            {settings?.autopilot_locked_at && (
              <span className="text-[10px] text-muted-foreground">
                since{" "}
                {new Date(
                  settings.autopilot_locked_at,
                ).toLocaleString()}
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1 md:flex-row md:items-center">
            <Textarea
              className="h-16 text-[11px]"
              placeholder="Optional reason for locking (only used when locking)."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <div className="mt-2 flex gap-2 md:mt-0 md:flex-col">
              <Button
                size="sm"
                className="h-8 text-[11px]"
                variant={locked ? "outline" : "default"}
                disabled={saving || locked}
                onClick={() => handleLockToggle(true)}
              >
                {saving && !locked ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <Lock className="mr-1 h-3 w-3" />
                )}
                Lock
              </Button>
              <Button
                size="sm"
                className="h-8 text-[11px]"
                variant={locked ? "default" : "outline"}
                disabled={saving || !locked}
                onClick={() => handleLockToggle(false)}
              >
                {saving && locked ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : (
                  <Unlock className="mr-1 h-3 w-3" />
                )}
                Unlock
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Events list */}
      <Card className="p-4 text-xs">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-semibold">Recent guardrail hits</span>
          <span className="text-[10px] text-muted-foreground">
            Last {events.length} events
          </span>
        </div>
        {events.length === 0 ? (
          <p className="py-4 text-center text-[11px] text-muted-foreground">
            No guardrail events yet. When caps or locks are triggered,
            they'll appear here.
          </p>
        ) : (
          <div className="space-y-2">
            {events.map((e) => (
              <div
                key={e.id}
                className="flex items-start gap-2 rounded-md border bg-card px-2 py-2"
              >
                <div className="mt-1 h-2 w-2 rounded-full bg-red-500/80" />
                <div className="flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className="text-[9px] uppercase"
                      >
                        {e.guardrail_type}
                      </Badge>
                      {e.email_domain && (
                        <span className="text-[10px] text-muted-foreground">
                          Domain: {e.email_domain}
                        </span>
                      )}
                      {e.lead_id && (
                        <span className="text-[10px] text-muted-foreground">
                          Lead ID: {e.lead_id}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(e.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px]">{e.message}</p>
                  {e.context && Object.keys(e.context).length > 0 && (
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {JSON.stringify(e.context)}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

