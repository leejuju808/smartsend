"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { PreflightModal, PreflightResult, PreflightStatus, STATUS_LABELS } from "./PreflightModal";

type RawPreflight = {
  eligible?: number | null;
  blocked?: number | null;
  identity_capacity?: number | null;
  status?: string | null;
  issues?: unknown;
};

function parseIssues(raw: unknown) {
  if (!raw) return [];
  try {
    const value = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(value)) return [];
    return value
      .map((entry) => {
        if (!entry || typeof entry !== "object") return null;
        const record = entry as Record<string, unknown>;
        return {
          kind: String(record.kind ?? record.code ?? "unknown"),
          message: String(record.message ?? record.reason ?? ""),
          count: typeof record.count === "number" ? record.count : Number(record.count ?? 0) || 0,
        };
      })
      .filter(Boolean) as PreflightResult["issues"];
  } catch {
    return [];
  }
}

function normalizePreflight(raw: RawPreflight | null | undefined): PreflightResult | null {
  if (!raw) return null;
  const status = String(raw.status ?? "ok").toLowerCase() as PreflightStatus;
  const validStatus: PreflightStatus = status === "warn" || status === "block" ? status : "ok";
  return {
    eligible: Number(raw.eligible ?? 0),
    blocked: Number(raw.blocked ?? 0),
    identity_capacity: Number(raw.identity_capacity ?? 0),
    status: validStatus,
    issues: parseIssues(raw.issues),
  };
}

export function PreflightButton({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [launching, setLaunching] = React.useState(false);
  const [allowOverride, setAllowOverride] = React.useState(false);
  const [preflight, setPreflight] = React.useState<PreflightResult | null>(null);
  const [lastResult, setLastResult] = React.useState<PreflightResult | null>(null);

  const runPreflight = React.useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/preflight`, { method: "POST" });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || "Failed to compute preflight.");
      }
      const json = await response.json();
      const normalized = normalizePreflight(json);
      setPreflight(normalized);
      setLastResult(normalized);
    } catch (error) {
      console.error("Preflight failed", error);
      toast.error(error instanceof Error ? error.message : "Unable to run preflight.");
      setPreflight(null);
    } finally {
      setLoading(false);
      setAllowOverride(false);
    }
  }, [campaignId]);

  React.useEffect(() => {
    if (open) {
      void runPreflight();
    }
  }, [open, runPreflight]);

  const launchCampaign = React.useCallback(async () => {
    setLaunching(true);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/launch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowOverride }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        if (response.status === 409 && payload?.preflight) {
          const updated = normalizePreflight(payload.preflight);
          setPreflight(updated);
          setLastResult(updated);
          setAllowOverride(false);
          toast.error("Launch blocked by preflight guard.");
          return;
        }
        toast.error(payload?.error ?? "Failed to launch campaign.");
        return;
      }

      const updated = normalizePreflight(payload?.preflight);
      if (updated) {
        setPreflight(updated);
        setLastResult(updated);
      }

      toast.success("Campaign launch queued.");
      setOpen(false);
      router.refresh();
    } catch (error) {
      console.error("Launch failed", error);
      toast.error(error instanceof Error ? error.message : "Launch failed.");
    } finally {
      setLaunching(false);
    }
  }, [allowOverride, campaignId, router]);

  const statusMeta = lastResult ? STATUS_LABELS[lastResult.status] : null;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2"
      >
        Preflight
        {statusMeta && (
          <span
            className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusMeta.tone}`}
          >
            {statusMeta.label}
          </span>
        )}
      </Button>
      <PreflightModal
        open={open}
        onOpenChange={setOpen}
        data={preflight}
        loading={loading}
        launching={launching}
        allowOverride={allowOverride}
        onToggleOverride={setAllowOverride}
        onRefetch={runPreflight}
        onLaunch={launchCampaign}
        onSchedule={() => {
          setOpen(false);
          router.push(`/campaigns/${campaignId}/settings/sending`);
        }}
      />
    </>
  );
}


