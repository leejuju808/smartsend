"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type Preview = {
  subject?: string;
  body?: string;
  scenario?: string;
  tone?: string;
  variant_id?: string;
  template_body?: string;
};

type Peek = { lead_first?: string; company?: string; booking_link?: string };

export default function NudgeButton({ threadId }: { threadId: string }) {
  const [loading, setLoading] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [usePreview, setUsePreview] = React.useState(true);
  const [preview, setPreview] = React.useState<Preview | null>(null);
  const [abEnabled, setAbEnabled] = React.useState<boolean | null>(null);
  const [pickerInfo, setPickerInfo] = React.useState<{ mode: string; eps: number } | null>(null);
  const [threadMeta, setThreadMeta] = React.useState<{ campaign_id: string } | null>(null);
  const [capInfo, setCapInfo] = React.useState<{ used?: number; cap?: number; capped?: boolean } | undefined>();
  const [peek, setPeek] = React.useState<Peek | null>(null);

  const applyTokens = React.useCallback(
    (text: string) => {
      const leadFirst = peek?.lead_first ?? "";
      const company = peek?.company ?? "";
      const booking = peek?.booking_link ?? "";
      return (text || "")
        .replaceAll("{lead_first}", leadFirst)
        .replaceAll("{company}", company)
        .replaceAll("{me}", "SmartSend")
        .replaceAll("{duration}", "30")
        .replaceAll("{booking_link}", booking)
        .replaceAll("{last_msg}", "")
        .replaceAll("{cta}", "Open to a quick intro?");
    },
    [peek]
  );

  const loadPeek = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/thread/${threadId}/lead/peek`, { cache: "no-store" });
      const payload = await res.json().catch(() => null);
      if (payload?.ok) {
        setPeek({
          lead_first: payload.peek?.lead_first || "",
          company: payload.peek?.company || "",
          booking_link: payload.peek?.booking_link || "",
        });
      } else {
        setPeek(null);
      }
    } catch {
      setPeek(null);
    }
  }, [threadId]);

  const loadRules = React.useCallback(async (campaignId: string) => {
    try {
      const r = await fetch(`/api/campaign/${campaignId}/followup/rules`).then((res) => res.json());
      if (r?.ok && r.rules) {
        const eps = Number(r.rules.picker_epsilon);
        setPickerInfo({
          mode: r.rules.picker_mode ?? "explore",
          eps: Number.isFinite(eps) ? eps : 0,
        });
      } else {
        setPickerInfo(null);
      }
    } catch {
      setPickerInfo(null);
    }
  }, []);

  const loadCap = React.useCallback(
    async (campaignId: string, scenario?: string, tone?: string) => {
      if (!scenario || !tone) {
        setCapInfo(undefined);
        return;
      }
      try {
        const [usageRes, capsRes] = await Promise.all([
          fetch(`/api/campaign/${campaignId}/followup/caps-usage`, { cache: "no-store" }),
          fetch(`/api/campaign/${campaignId}/followup/caps`, { cache: "no-store" }),
        ]);
        const [usagePayload, capsPayload] = await Promise.all([usageRes.json(), capsRes.json()]);
        if (!usagePayload?.ok) {
          setCapInfo(undefined);
          return;
        }
        const usageRow = Array.isArray(usagePayload.usage)
          ? usagePayload.usage.find((u: any) => u.scenario === scenario && u.tone === tone)
          : null;
        let capRow: any = null;
        if (capsPayload?.ok && Array.isArray(capsPayload.caps)) {
          capRow = capsPayload.caps.find((c: any) => c.scenario === scenario && c.tone === tone);
        }
        if (capRow) {
          const used = Number(usageRow?.used_today ?? 0);
          const cap = Number(capRow.daily_cap ?? 0);
          setCapInfo({
            used,
            cap,
            capped: Number.isFinite(cap) && cap > 0 ? used >= cap : false,
          });
        } else {
          setCapInfo({
            used: Number(usageRow?.used_today ?? 0),
            cap: undefined,
            capped: false,
          });
        }
      } catch {
        setCapInfo(undefined);
      }
    },
    []
  );

  React.useEffect(() => {
    setThreadMeta(null);
    setCapInfo(undefined);
    setPeek(null);
    let cancelled = false;
    async function load() {
      try {
        const meta = await fetch(`/api/thread/${threadId}/meta`).then((r) => r.json());
        if (!meta?.campaign_id) return;
        if (!cancelled) {
          setThreadMeta({ campaign_id: meta.campaign_id });
        }
        const rule = await fetch(`/api/campaign/${meta.campaign_id}/followup/ab-enabled`).then((r) => r.json());
        if (!cancelled) {
          setAbEnabled(!!rule?.ab_enabled);
        }
        if (!cancelled) {
          await loadRules(meta.campaign_id);
        }
      } catch {
        if (!cancelled) setAbEnabled(null);
        if (!cancelled) setPickerInfo(null);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [threadId, loadRules]);

  const fetchPreview = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/thread/${threadId}/nudge/pick`, { method: "POST" });
      const text = await res.text();
      const payload = text ? JSON.parse(text) : null;
      if (!res.ok || !payload?.ok) {
        if (payload?.reason === "no_variant") {
          toast.error("No active variants match.");
        } else {
          toast.error("Couldn't pick a variant.");
        }
        setPreview(null);
        return;
      }
      const nextPreview: Preview = {
        subject: payload.variant?.subject,
        body: applyTokens(payload.variant?.body ?? ""),
        scenario: payload.scenario,
        tone: payload.tone,
        variant_id: payload.variant?.id,
        template_body: payload.variant?.body ?? "",
      };
      setPreview(nextPreview);
      if (threadMeta?.campaign_id) {
        loadCap(threadMeta.campaign_id, nextPreview.scenario, nextPreview.tone);
      } else {
        setCapInfo(undefined);
      }
    } catch {
      toast.error("Preview failed.");
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, [threadId, threadMeta?.campaign_id, loadCap, applyTokens]);

  const enqueue = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/thread/${threadId}/nudge/queue`, { method: "POST" });
      const text = await res.text();
      const payload = text ? JSON.parse(text) : null;

      if (!res.ok) {
        if (res.status === 429) {
          const map: Record<string, string> = {
            thread_cooldown: "Hold up — this thread is in cooldown.",
            lead_daily_cap: "Daily cap reached for this lead today.",
            cap_reached: "Scenario cap reached for today.",
            thread_not_found: "Thread not found.",
            forbidden: "No permission to nudge this campaign.",
          };
          const key = payload?.error ?? payload?.reason;
          toast.error(map[key as keyof typeof map] ?? "Nudge blocked by policy.");
          return;
        }
        toast.error(payload?.error ?? "Failed to queue nudge.");
        return;
      }

      toast.success(payload?.variant_id ? "Queued via A/B" : "Queued");
      window.dispatchEvent(new CustomEvent("thread:flags:refresh"));
      window.dispatchEvent(new CustomEvent("inbox:counts:refresh"));
      if (threadMeta?.campaign_id && preview?.scenario && preview?.tone) {
        loadCap(threadMeta.campaign_id, preview.scenario, preview.tone);
      }
      setOpen(false);
    } catch {
      toast.error("Network error.");
    } finally {
      setLoading(false);
    }
  }, [threadId, threadMeta?.campaign_id, preview?.scenario, preview?.tone, loadCap]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || target?.isContentEditable) {
        return;
      }
      if (e.key.toLowerCase() === "n") {
        setOpen(true);
        if (usePreview) {
          fetchPreview();
        }
        loadPeek();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fetchPreview, usePreview, loadPeek]);

  React.useEffect(() => {
    if (threadMeta?.campaign_id && preview?.scenario && preview?.tone) {
      loadCap(threadMeta.campaign_id, preview.scenario, preview.tone);
    }
  }, [threadMeta?.campaign_id, preview?.scenario, preview?.tone, loadCap]);

  React.useEffect(() => {
    setPreview((prev) => {
      if (!prev) return prev;
      const source = prev.template_body ?? prev.body ?? "";
      const nextBody = applyTokens(source);
      if (nextBody === prev.body) {
        return prev;
      }
      return { ...prev, body: nextBody };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peek]);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next && usePreview) {
          fetchPreview();
        }
        if (next) {
          loadPeek();
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button size="sm" variant="default">
          Nudge{abEnabled === null ? "" : abEnabled ? " (A/B)" : ""}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[520px]">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <div className="font-semibold">Nudge{abEnabled ? " (A/B)" : ""}</div>
            <div className="text-[11px] text-muted-foreground">
              Tokens: {peek ? "lead-aware" : "stubbed"}
              {pickerInfo ? ` · Picker ${pickerInfo.mode} · ε=${Math.round((pickerInfo.eps || 0) * 100)}%` : ""}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="nudge-preview" className="text-xs text-muted-foreground">
              Preview
            </Label>
            <Switch
              id="nudge-preview"
              checked={usePreview}
              onCheckedChange={(checked) => {
                setUsePreview(checked);
                if (checked) {
                  fetchPreview();
                  if (open) {
                    loadPeek();
                  }
                }
              }}
            />
          </div>
        </div>

        {usePreview ? (
          <div className="space-y-2">
            <div className="space-y-1 text-xs text-muted-foreground">
              <div>{loading ? "Picking best variant…" : preview ? "Variant ready." : "No preview yet"}</div>
              {preview?.scenario && preview?.tone && capInfo && (
                <div>
                  {typeof capInfo.cap === "number"
                    ? `${preview.scenario} · ${preview.tone} — Today: ${capInfo.used ?? 0}/${capInfo.cap}${
                        capInfo.capped ? " (at cap)" : ""
                      }`
                    : `${preview.scenario} · ${preview.tone} — No cap set`}
                </div>
              )}
            </div>
            <div className="rounded border bg-muted/40 p-2">
              <div className="text-sm">
                <b>Subject:</b> {preview?.subject || "(thread subject will be used)"}
              </div>
              <pre className="mt-1 whitespace-pre-wrap text-sm">
                {preview?.body || "(Body will render with lead tokens at send time.)"}
              </pre>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={fetchPreview} disabled={loading}>
                Refresh
              </Button>
              <Button size="sm" onClick={enqueue} disabled={loading}>
                {loading ? "Queuing…" : "Send nudge"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex justify-end">
            <Button size="sm" onClick={enqueue} disabled={loading}>
              {loading ? "Queuing…" : "Send nudge"}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}


