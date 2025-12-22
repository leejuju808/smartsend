"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export type PreflightIssue = {
  kind: string;
  message: string;
  count?: number;
};

export type PreflightStatus = "ok" | "warn" | "block";

export type PreflightResult = {
  eligible: number;
  blocked: number;
  identity_capacity: number;
  status: PreflightStatus;
  issues: PreflightIssue[];
};

export const STATUS_LABELS: Record<PreflightStatus, { label: string; tone: string }> = {
  ok: { label: "Ready", tone: "bg-emerald-100 text-emerald-800 border-emerald-200" },
  warn: { label: "Review", tone: "bg-amber-100 text-amber-800 border-amber-200" },
  block: { label: "Blocked", tone: "bg-red-100 text-red-800 border-red-200" },
};

const ISSUE_TONE: Record<string, "warn" | "block" | "info"> = {
  quiet_hours: "warn",
  no_capacity: "warn",
  cooldown: "warn",
  low_score: "warn",
  suppressed: "warn",
  no_identity: "block",
  no_segment: "block",
};

function issueBadgeTone(kind: string) {
  const tone = ISSUE_TONE[kind] ?? "info";
  if (tone === "warn") return "bg-amber-100 text-amber-800 border-amber-200";
  if (tone === "block") return "bg-red-100 text-red-800 border-red-200";
  return "bg-slate-100 text-slate-800 border-slate-200";
}

type PreflightModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: PreflightResult | null;
  loading: boolean;
  launching: boolean;
  allowOverride: boolean;
  onToggleOverride: (value: boolean) => void;
  onRefetch: () => void;
  onLaunch: () => Promise<void>;
  onSchedule: () => void;
};

export function PreflightModal(props: PreflightModalProps) {
  const {
    open,
    onOpenChange,
    data,
    loading,
    launching,
    allowOverride,
    onToggleOverride,
    onRefetch,
    onLaunch,
    onSchedule,
  } = props;

  const status = data?.status ?? "ok";
  const statusMeta = STATUS_LABELS[status];
  const issues = data?.issues ?? [];
  const hasBlocking = status === "block";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl space-y-6">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <DialogTitle>Campaign Preflight</DialogTitle>
            <Badge className={cn("border px-2 py-0.5 text-xs font-medium", statusMeta.tone)}>
              {statusMeta.label}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Validate capacity, policy gates, and suppression rules before launching this campaign.
          </p>
        </DialogHeader>

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border p-4">
            <div className="text-xs uppercase text-muted-foreground">Eligible</div>
            <div className="mt-2 text-2xl font-semibold">
              {loading ? "…" : data?.eligible ?? "—"}
            </div>
          </div>
          <div className="rounded-2xl border p-4">
            <div className="text-xs uppercase text-muted-foreground">Blocked</div>
            <div className="mt-2 text-2xl font-semibold">
              {loading ? "…" : data?.blocked ?? "—"}
            </div>
          </div>
          <div className="rounded-2xl border p-4">
            <div className="text-xs uppercase text-muted-foreground">Identity capacity</div>
            <div className="mt-2 text-2xl font-semibold">
              {loading ? "…" : data?.identity_capacity ?? "—"}
            </div>
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Issues</h3>
            <Button variant="outline" size="sm" onClick={onRefetch} disabled={loading || launching}>
              Rescan
            </Button>
          </div>
          {loading ? (
            <div className="text-sm text-muted-foreground">Running preflight…</div>
          ) : issues.length === 0 ? (
            <Alert className="border-emerald-200 bg-emerald-50 text-emerald-800">
              <AlertTitle>All clear</AlertTitle>
              <AlertDescription>
                No policy or capacity issues detected. You are safe to launch this campaign.
              </AlertDescription>
            </Alert>
          ) : (
            <ul className="space-y-2">
              {issues.map((issue) => (
                <li key={`${issue.kind}:${issue.message}`} className="rounded-2xl border p-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge className={cn("border px-2 py-0.5 text-xs font-medium", issueBadgeTone(issue.kind))}>
                          {issue.kind}
                        </Badge>
                        {typeof issue.count === "number" && issue.count > 0 && (
                          <span className="text-xs text-muted-foreground">{issue.count}</span>
                        )}
                      </div>
                      <p className="mt-2 text-sm">{issue.message}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {hasBlocking && (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-amber-900">Override launch guard</div>
                <p className="text-xs text-amber-900/80">
                  Launching may impact deliverability. Confirm you understand the risks.
                </p>
              </div>
              <Switch checked={allowOverride} onCheckedChange={(checked) => onToggleOverride(Boolean(checked))} />
            </div>
          </section>
        )}

        <DialogFooter className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:gap-4">
          <div className="flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center">
            <span>Next steps:</span>
            <div className="flex items-center gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={onSchedule}>
                Schedule
              </Button>
            </div>
          </div>
          <Button
            type="button"
            onClick={onLaunch}
            disabled={launching || loading || (hasBlocking && !allowOverride)}
          >
            {launching ? "Launching…" : hasBlocking && !allowOverride ? "Launch blocked" : "Launch now"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

