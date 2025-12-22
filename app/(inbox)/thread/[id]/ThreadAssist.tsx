"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { PreflightBanner } from "./PreflightBanner";
import { OfferTimes } from "./OfferTimes";

type Suggestion = {
  tone?: string;
  subject?: string;
  body?: string;
};

type Action = {
  key: "OFFER_TIMES" | "ROUTE" | "CLOSE" | "CREATE_TASK" | "SEND_NUDGE" | string;
  label?: string;
  meta?: Record<string, unknown>;
};

type AssistResponse = {
  summary?: string;
  entities?: {
    people?: string[];
    company?: string;
    ask?: string;
    dates?: string[];
    links?: string[];
  };
  suggestions?: Suggestion[];
  actions?: Action[];
};

const RUN_COOLDOWN_MS = 10_000;

type ThreadAssistProps = {
  threadId: string;
  campaignId: string;
  calendarId?: string | null;
  accountId: string;
  fromEmail: string;
  toEmail: string;
  onInsert: (draft: { subject: string; body: string }) => void;
};

export function ThreadAssist({
  threadId,
  campaignId,
  calendarId,
  accountId,
  fromEmail,
  toEmail,
  onInsert
}: ThreadAssistProps) {
  const [loading, setLoading] = React.useState(false);
  const [data, setData] = React.useState<AssistResponse | null>(null);
  const [selected, setSelected] = React.useState<number | null>(null);
  const lastRunRef = React.useRef<{ at: number; tone: string; payload: AssistResponse | null } | null>(null);

  const run = React.useCallback(
    async (tone: "friendly" | "professional" | "concise" | "assertive" = "friendly") => {
      const now = Date.now();
      if (
        lastRunRef.current &&
        lastRunRef.current.tone === tone &&
        now - lastRunRef.current.at < RUN_COOLDOWN_MS &&
        lastRunRef.current.payload
      ) {
        setData(lastRunRef.current.payload);
        return;
      }

      if (!threadId || !campaignId) {
        return;
      }

      if (
        lastRunRef.current &&
        now - lastRunRef.current.at < RUN_COOLDOWN_MS &&
        lastRunRef.current.tone !== tone
      ) {
        const waitMs = RUN_COOLDOWN_MS - (now - lastRunRef.current.at);
        toast.info(`Assist cooling down — try again in ${Math.ceil(waitMs / 1000)}s`);
        return;
      }

      setLoading(true);
      try {
        const res = await fetch("/api/thread/assist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            thread_id: threadId,
            campaign_id: campaignId,
            user_id: "me",
            tone
          })
        });
        if (!res.ok) {
          throw new Error(await res.text());
        }
        const json = (await res.json()) as AssistResponse;
        setData(json);
        setSelected(null);
        lastRunRef.current = { at: now, tone, payload: json };
      } catch (error) {
        console.error("thread assist failed", error);
        toast.error("Assist failed");
      } finally {
        setLoading(false);
      }
    },
    [campaignId, threadId]
  );

  React.useEffect(() => {
    lastRunRef.current = null;
    setData(null);
    setSelected(null);
    if (threadId) {
      run();
    }
  }, [run, threadId]);

  const selectedSuggestion = React.useMemo(() => {
    if (typeof selected !== "number" || !data?.suggestions) return null;
    return data.suggestions[selected] ?? null;
  }, [data?.suggestions, selected]);

  return (
    <Card className="rounded-2xl border">
      <CardContent className="space-y-4 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">Thread Assist</h3>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={loading} onClick={() => run("friendly")}>
              Friendly
            </Button>
            <Button size="sm" variant="outline" disabled={loading} onClick={() => run("professional")}>
              Professional
            </Button>
            <Button size="sm" variant="outline" disabled={loading} onClick={() => run("concise")}>
              Concise
            </Button>
          </div>
        </div>

        {data?.summary && (
          <div className="text-sm">
            <div className="mb-1 font-medium">Summary</div>
            <p className="text-slate-700">{data.summary}</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {(data.entities?.people ?? []).map((person, index) => (
                <Badge key={`${person}-${index}`} variant="secondary">
                  👤 {person}
                </Badge>
              ))}
              {data.entities?.company ? (
                <Badge variant="secondary">🏢 {data.entities.company}</Badge>
              ) : null}
              {(data.entities?.dates ?? []).slice(0, 3).map((date, index) => (
                <Badge key={`${date}-${index}`} variant="secondary">
                  📅 {date}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          {(data?.suggestions ?? []).map((suggestion, index) => (
            <div
              key={`${suggestion.subject ?? "suggestion"}-${index}`}
              className={`rounded-xl border p-3 transition-colors ${
                selected === index ? "border-emerald-400" : "border-transparent hover:border-slate-300"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium">{suggestion.subject || "Re:"}</div>
                <div className="text-xs opacity-70">{suggestion.tone}</div>
              </div>
              <div className="mt-1 whitespace-pre-wrap text-sm">{suggestion.body}</div>
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setSelected(index)}>
                  Preview
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    const nextSubject = suggestion.subject ?? "";
                    const nextBody = suggestion.body ?? "";
                    if (!nextSubject && !nextBody) {
                      toast.info("Draft is empty");
                      return;
                    }
                    onInsert({ subject: nextSubject, body: nextBody });
                    setSelected(index);
                    toast.success("Draft inserted");
                  }}
                >
                  Insert
                </Button>
              </div>
            </div>
          ))}
          {(!data || (data?.suggestions?.length ?? 0) === 0) && (
            <p className="text-sm opacity-70">{loading ? "Thinking…" : "No suggestions yet."}</p>
          )}
        </div>

        {data?.actions?.length ? (
          <div className="space-y-2">
            <div className="text-sm font-medium">Next Best Actions</div>
            <div className="flex flex-wrap gap-2">
              {data.actions.map((action, index) => {
                if (action.key === "OFFER_TIMES" && calendarId) {
                  return (
                    <OfferTimes
                      key={`offer-times-${index}`}
                      threadId={threadId}
                      campaignId={campaignId}
                      calendarId={calendarId ?? undefined}
                      onInsert={(text) => onInsert({ subject: "Proposed times", body: text })}
                    />
                  );
                }
                if (action.key === "SEND_NUDGE") {
                  return (
                    <Button
                      key={`send-nudge-${index}`}
                      size="sm"
                      onClick={() => toast.message("Queued nudge via Orchestrator")}
                    >
                      {action.label ?? "Send Nudge"}
                    </Button>
                  );
                }
                if (action.key === "ROUTE") {
                  return (
                    <Button key={`route-${index}`} size="sm" variant="outline">
                      {action.label ?? "Route to teammate"}
                    </Button>
                  );
                }
                if (action.key === "CLOSE") {
                  return (
                    <Button key={`close-${index}`} size="sm" variant="outline">
                      {action.label ?? "Close thread"}
                    </Button>
                  );
                }
                if (action.key === "CREATE_TASK") {
                  return (
                    <Button key={`task-${index}`} size="sm" variant="outline">
                      {action.label ?? "Create follow-up task"}
                    </Button>
                  );
                }
                return null;
              })}
            </div>
          </div>
        ) : null}

        {selectedSuggestion && (
          <PreflightBanner
            payload={{
              account_id: accountId,
              from_email: fromEmail,
              to_email: toEmail,
              subject: selectedSuggestion.subject ?? "",
              text: selectedSuggestion.body ?? ""
            }}
          />
        )}
      </CardContent>
    </Card>
  );
}






