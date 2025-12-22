"use client";

import * as React from "react";

async function postJSON<T>(url: string, body?: Record<string, unknown>) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.error || "Request failed");
  }
  return json as T;
}

type SuggestedAction = {
  type?: string;
  reason?: string;
  snooze_days?: number | null;
  label?: string | null;
  followup_subject?: string;
  followup_body?: string;
  anchorISO?: string | null;
};

type SummarizeResponse = {
  ok: boolean;
  summary?: string | string[];
  sentiment?: string;
  intent?: string;
  suggested_action?: SuggestedAction | null;
};

export function ThreadAssistant({ threadId }: { threadId: string }) {
  const [loading, setLoading] = React.useState(false);
  const [applying, setApplying] = React.useState(false);
  const [data, setData] = React.useState<SummarizeResponse | null>(null);
  const [suggestion, setSuggestion] = React.useState<SuggestedAction | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [applied, setApplied] = React.useState(false);

  const summarize = React.useCallback(async () => {
    setLoading(true);
    setErr(null);
    setApplied(false);
    try {
      const result = await postJSON<SummarizeResponse>(`/api/threads/${threadId}/summarize`);
      setData(result);
      setSuggestion(result.suggested_action ?? null);
    } catch (error: any) {
      setErr(error?.message || "Failed to summarize");
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  const apply = React.useCallback(async () => {
    if (!suggestion) return;
    setApplying(true);
    setErr(null);
    try {
      await postJSON(`/api/threads/${threadId}/apply-suggestion`, {
        followup_subject: suggestion.followup_subject ?? "",
        followup_body: suggestion.followup_body ?? "",
        snooze_days: suggestion.snooze_days ?? null,
        label: suggestion.label ?? null,
      });
      setApplied(true);
    } catch (error: any) {
      setErr(error?.message || "Failed to apply suggestion");
    } finally {
      setApplying(false);
    }
  }, [suggestion, threadId]);

  const insertTimes = React.useCallback(async () => {
    try {
      setErr(null);
      const anchor =
        (data?.suggested_action && "anchorISO" in data.suggested_action
          ? (data.suggested_action as SuggestedAction).anchorISO
          : null) ?? null;
      const res = await fetch(`/api/threads/${threadId}/propose-times`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anchorISO: anchor }),
      });
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload?.error || "Failed to propose times");
      }

      const bullets = Array.isArray(payload?.human) ? payload.human.map((h: string) => `- ${h}`).join("\n") : "";
      const currentBody = suggestion?.followup_body ?? data?.suggested_action?.followup_body ?? "";
      const injected = currentBody.includes("{{time_options}}")
        ? currentBody.replace("{{time_options}}", bullets)
        : `${currentBody}${currentBody ? "\n\n" : ""}Here are a few options:\n${bullets}`;

      setSuggestion((prev) => ({
        ...(prev ?? {}),
        followup_body: injected,
      }));
      setData((prev) =>
        prev
          ? {
              ...prev,
              suggested_action: {
                ...(prev.suggested_action ?? {}),
                followup_body: injected,
              },
            }
          : prev,
      );
    } catch (error: any) {
      setErr(error?.message || "Failed to propose times");
    }
  }, [data, suggestion, threadId]);

  const summaryText =
    data?.summary && Array.isArray(data.summary) ? data.summary.join("\n") : (data?.summary as string | undefined) ?? "";

  return (
    <div className="rounded-xl border p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">AI Reply Assistant</h3>
        <button
          onClick={summarize}
          className="h-8 px-3 rounded-md bg-zinc-900 text-white disabled:opacity-50"
          disabled={loading}
          title="Summarize latest inbound and suggest next action"
        >
          {loading ? "Analyzing…" : "Summarize"}
        </button>
      </div>

      {err ? <p className="text-sm text-rose-600">{err}</p> : null}

      {summaryText ? (
        <div className="space-y-2">
          <div className="text-sm whitespace-pre-wrap">{summaryText}</div>
          <div className="text-xs text-muted-foreground">
            Sentiment: <b>{data?.sentiment ?? "neutral"}</b> · Intent: <b>{data?.intent ?? "unclear"}</b>
          </div>

          <div className="rounded-lg border p-2">
            <div className="text-sm font-medium mb-1">Suggested Next Action</div>
            <div className="text-xs text-muted-foreground mb-2">{suggestion?.reason}</div>

            <div className="space-y-2">
              <input
                className="w-full h-9 border rounded px-2 text-sm"
                value={suggestion?.followup_subject ?? ""}
                onChange={(event) =>
                  setSuggestion((prev) => ({
                    ...(prev ?? {}),
                    followup_subject: event.target.value,
                  }))
                }
                placeholder="Follow-up subject"
              />
              <textarea
                className="w-full h-32 border rounded p-2 text-sm"
                value={suggestion?.followup_body ?? ""}
                onChange={(event) =>
                  setSuggestion((prev) => ({
                    ...(prev ?? {}),
                    followup_body: event.target.value,
                  }))
                }
                placeholder="Follow-up body"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2 mt-2">
              {suggestion?.snooze_days ? (
                <span className="text-[11px] px-2 py-1 rounded-2xl border">Snooze: {suggestion.snooze_days}d</span>
              ) : null}
              {suggestion?.label ? (
                <span className="text-[11px] px-2 py-1 rounded-2xl border">Label: {suggestion.label}</span>
              ) : null}
              <button
                onClick={insertTimes}
                className="h-8 px-3 rounded-md border text-sm"
                title="Generate 3 suggested time slots based on your campaign’s prefs"
              >
                Insert 3 Times
              </button>
              <button
                onClick={apply}
                className="ml-auto h-8 px-3 rounded-md bg-emerald-600 text-white disabled:opacity-50"
                disabled={!suggestion || applying || applied}
                title="Create/Update draft and apply snooze/label"
              >
                {applied ? "Applied ✓" : applying ? "Applying…" : "Apply to Draft"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

