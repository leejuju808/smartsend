"use client";

import { useEffect, useMemo, useState } from "react";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { toast } from "sonner";

type GuardIssue = {
  rule: string;
  msg: string;
  severity: "info" | "warn" | "error";
};

type GuardResponse = {
  blocked: boolean;
  draft: string;
  issues: GuardIssue[];
};

type LeadContext = {
  industry?: string | null;
  role?: string | null;
  tech_stack?: string[] | null;
  region?: string | null;
};

type PersonalizationMeta = {
  role_hint?: string | null;
  tech_stack?: string[] | null;
  industry?: string | null;
  region?: string | null;
  score?: number | null;
};

type Props = {
  threadId: string;
  label: string | null;
  threadSummary: string | null;
  setDraft: (t: string) => void;
  guardVars?: Record<string, string | number | null | undefined>;
  onGenerated?: (payload: {
    draft: string;
    tone?: string | null;
    eventId?: string;
    cached?: boolean;
    guard?: GuardResponse;
    personalizationApplied?: boolean;
    personalizationLine?: string | null;
    personalizationMeta?: PersonalizationMeta | null;
  }) => void;
  onGuardResult?: (result: GuardResponse) => void;
  campaignId?: string | null;
  mergeVars?: Record<string, any> | null;
  leadContext?: LeadContext | null;
};

export function FollowUpButton({
  threadId,
  label,
  threadSummary,
  setDraft,
  guardVars,
  onGenerated,
  onGuardResult,
  campaignId,
  mergeVars,
  leadContext,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const supabase = createClientComponentClient();

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        console.error("Failed to load user", error);
        return;
      }
      setUserId(data.user?.id ?? null);
    })();
  }, [supabase]);

  const requestVars = useMemo(() => {
    if (!mergeVars) return undefined;
    const filtered: Record<string, any> = {};
    for (const [key, value] of Object.entries(mergeVars)) {
      if (value === null || typeof value === "undefined") continue;
      filtered[key] = value;
    }
    return Object.keys(filtered).length > 0 ? filtered : undefined;
  }, [mergeVars]);

  const requestLeadContext = useMemo<LeadContext | undefined>(() => {
    if (!leadContext) return undefined;
    const ctx: LeadContext = {};
    if (leadContext.industry) ctx.industry = leadContext.industry;
    if (leadContext.role) ctx.role = leadContext.role;
    if (Array.isArray(leadContext.tech_stack) && leadContext.tech_stack.length > 0) {
      ctx.tech_stack = leadContext.tech_stack;
    }
    if (leadContext.region) ctx.region = leadContext.region;
    return Object.keys(ctx).length > 0 ? ctx : undefined;
  }, [leadContext]);

  async function generate() {
    if (!label) {
      toast.error("No reply label detected yet. Try refreshing once the classifier runs.");
      return;
    }

    if (!userId) {
      toast.error("Sign in to generate a follow-up.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/functions/v1/nudge-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label,
          thread_summary: threadSummary || "",
          thread_id: threadId,
          campaign_id: campaignId ?? null,
          owner_id: userId,
          vars: requestVars ?? {},
          lead_context: requestLeadContext ?? null
        })
      });
      
      const payload = await res.json().catch(() => null);

      if (!res.ok || !payload) {
        const message = payload?.error || "Failed to generate follow-up";
        throw new Error(message);
      }

      const {
        draft,
        tone,
        event_id,
        eventId,
        cached,
        personalization_applied,
        personalization_line,
        personalization_meta
      } = payload;

      if (typeof draft === "string" && draft.trim().length > 0) {
        const trimmed = draft.trim();

        let guard: GuardResponse | null = null;
        try {
          const guardRes = await fetch("/functions/v1/nudge-guard", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              owner_id: userId,
              event_id: event_id || eventId || null,
              draft: trimmed,
              vars: guardVars ?? {},
            }),
          });
          const guardPayload = await guardRes.json().catch(() => null);
          if (!guardRes.ok || !guardPayload) {
            const message = guardPayload?.error || "Compliance guard failed";
            throw new Error(message);
          }
          guard = {
            blocked: Boolean(guardPayload.blocked),
            draft: typeof guardPayload.draft === "string" ? guardPayload.draft : trimmed,
            issues: Array.isArray(guardPayload.issues) ? guardPayload.issues : [],
          };
        } catch (guardError: any) {
          console.error("Follow-up guard error:", guardError);
          toast.error(guardError?.message || "Guardrail check failed — review before sending.");
          guard = {
            blocked: false,
            draft: trimmed,
            issues: [],
          };
        }

        const finalDraft = guard?.draft?.trim?.() ? guard.draft.trim() : trimmed;
        setDraft(finalDraft);

        const guardResult = guard ?? { blocked: false, draft: finalDraft, issues: [] };

        onGuardResult?.(guardResult);
        onGenerated?.({
          draft: finalDraft,
          tone,
          eventId: event_id || eventId,
          cached: Boolean(cached),
          guard: guardResult,
          personalizationApplied: Boolean(personalization_applied),
          personalizationLine: personalization_line ?? null,
          personalizationMeta: personalization_meta ?? null
        });

        if (guardResult.blocked) {
          toast.error("Draft blocked by Compliance Guard. Review issues before sending.");
        } else if (guardResult.issues.length > 0) {
          toast.warning("Draft adjusted for policy review.");
        } else if (tone) {
          const personalizationNote =
            personalization_applied && personalization_line
              ? ` • Personalized ✓`
              : "";
          toast.success(`Tone: ${tone} • Draft loaded${cached ? " (cached)" : ""}${personalizationNote}`);
        } else {
          const personalizationNote =
            personalization_applied && personalization_line
              ? ` • Personalized ✓`
              : "";
          toast.success(`Draft loaded${cached ? " (cached)" : ""}${personalizationNote}`);
        }
      } else {
        throw new Error("No follow-up message returned");
      }
    } catch (e: any) {
      console.error("Follow-up generation error:", e);
      toast.error(e.message || "Failed to generate follow-up");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      disabled={loading}
      onClick={generate}
      className="text-sm border rounded-md px-2 py-1 hover:bg-muted disabled:opacity-50"
    >
      {loading ? "Generating..." : "Generate Follow-Up"}
    </button>
  );
}

