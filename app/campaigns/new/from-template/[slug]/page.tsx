"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useCampaignTemplate } from "@/hooks/useCampaignTemplate";
import { useCurrentWorkspace } from "@/hooks/useCurrentWorkspace";
import { cn } from "@/lib/utils";

type StepDraft = {
  id: string;
  step_order: number;
  delay_days: number;
  subject: string;
  body: string;
};

export default function NewCampaignFromTemplatePage() {
  const router = useRouter();
  const params = useParams();
  const slug = params.slug as string;
  const { template, steps, loading } = useCampaignTemplate(slug);
  const { workspace } = useCurrentWorkspace();
  const [campaignName, setCampaignName] = useState("");
  const [stepDrafts, setStepDrafts] = useState<StepDraft[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [personalizing, setPersonalizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isLocked =
    template?.slug === "storm-check-free-roof-inspection-v1" ||
    template?.name === "Storm Check — Free Roof Inspection" ||
    (template as any)?.locked === true;

  // Initialize local state when loaded
  useEffect(() => {
    if (!loading && template && steps.length && stepDrafts.length === 0) {
      setCampaignName(template.name);
      setStepDrafts(
        steps.map((s: any) => ({
          id: s.id,
          step_order: s.step_order,
          delay_days: s.delay_days,
          subject: s.subject_template,
          body: s.body_template,
        }))
      );
    }
  }, [loading, template, steps, stepDrafts.length]);

  async function handleAIPersonalize() {
    if (isLocked) return;
    if (!workspace) {
      setError("Workspace not found. Please refresh the page.");
      return;
    }
    if (!campaignName || !stepDrafts.length) {
      setError("Campaign name and steps are required for personalization.");
      return;
    }

    setPersonalizing(true);
    setError(null);

    try {
      const res = await fetch("/api/ai/personalize-campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId: workspace.id,
          campaignName,
          steps: stepDrafts.map((s) => ({
            step_order: s.step_order,
            delay_days: s.delay_days,
            subject: s.subject,
            body: s.body,
          })),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "AI personalization failed. Try again.");
      }

      const data = await res.json();

      setStepDrafts((prev) =>
        prev.map((s) => {
          const match = data.steps.find(
            (r: any) => r.step_order === s.step_order,
          );
          if (!match) return s;
          return {
            ...s,
            subject: match.subject,
            body: match.body,
          };
        }),
      );
    } catch (e) {
      console.error(e);
      setError(
        e instanceof Error ? e.message : "Failed to personalize campaign",
      );
    } finally {
      setPersonalizing(false);
    }
  }

  async function handleCreate() {
    if (!campaignName.trim()) {
      setError("Campaign name is required");
      return;
    }

    if (stepDrafts.length === 0) {
      setError("At least one step is required");
      return;
    }

    // Check if steps have content
    const validSteps = stepDrafts.filter(
      (s) => s.subject.trim() && s.body.trim()
    );
    if (validSteps.length === 0) {
      setError("At least one step must have both subject and body");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // Locked-copy templates are instantiated directly into campaign_steps (no editing).
      if (isLocked) {
        const res = await fetch("/api/campaigns/from-template", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            templateId: template.id,
            campaignName: campaignName.trim(),
          }),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error ?? "Failed to create campaign");
          setSubmitting(false);
          return;
        }

        router.push(`/campaigns/${data.campaign_id}/leads/upload`);
        return;
      }

      // Fetch email accounts first
      const accountsRes = await fetch("/api/email/accounts");
      if (!accountsRes.ok) {
        throw new Error("Failed to load email accounts");
      }
      const accountsJson = await accountsRes.json();
      const accounts = accountsJson.accounts ?? [];

      if (accounts.length === 0) {
        setError(
          "No email accounts found. Please connect an email account in Settings first."
        );
        setSubmitting(false);
        return;
      }

      // Convert stepDrafts to sequence format expected by API
      const sequence = validSteps.map((step, idx) => ({
        step: idx + 1,
        subject: step.subject.trim(),
        body: step.body.trim(),
        delayDays: step.delay_days,
      }));

      // Get today's date for start date
      const today = new Date();
      const startDate = today.toISOString().slice(0, 10);

      // Create campaign using existing API
      const payload = {
        name: campaignName.trim(),
        objective: template.description || undefined,
        fromEmailAccountId: accounts[0].id, // Use first available account
        audienceType: "all_leads" as const,
        sequence,
        startDate,
        dailySendCap: 200,
        sendingWindowStart: "08:00",
        sendingWindowEnd: "17:00",
        timezone: "America/Los_Angeles",
      };

      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create campaign");
        setSubmitting(false);
        return;
      }

      // Redirect to campaign review page (Block 15700)
      router.push(data.next ?? `/campaigns/${data.id}/review`);
    } catch (e) {
      console.error(e);
      setError(
        e instanceof Error ? e.message : "Failed to create campaign"
      );
      setSubmitting(false);
    }
  }

  if (loading || !template) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading template…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-start justify-center">
      <div className="w-full max-w-3xl px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">
              {isLocked ? "Create Campaign" : "Customize Campaign"}
            </h1>
            <p className="text-xs text-muted-foreground mt-1">
              {isLocked
                ? "This template is locked. Name your campaign, upload leads, then launch."
                : "Edit the template steps to match your style, then create your campaign."}
            </p>
          </div>
          {!isLocked && (
            <button
              onClick={handleAIPersonalize}
              disabled={personalizing || !workspace || !campaignName || !stepDrafts.length}
              className={cn(
                "text-xs px-3 py-1.5 rounded-xl border transition-colors",
                personalizing || !workspace || !campaignName || !stepDrafts.length
                  ? "bg-gray-100 dark:bg-slate-800 text-gray-400 cursor-not-allowed"
                  : "bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800"
              )}
            >
              {personalizing ? "Personalizing..." : "AI Personalize Copy"}
            </button>
          )}
        </div>

        {error && (
          <div className="text-xs text-destructive border border-destructive/40 rounded-md px-3 py-2">
            {error}
          </div>
        )}

        <div className="space-y-2">
          <label className="text-xs font-semibold">Campaign name</label>
          <input
            value={campaignName}
            onChange={(e) => setCampaignName(e.target.value)}
            className="w-full border rounded-xl px-3 py-2 text-sm bg-background"
            placeholder="Enter campaign name"
          />
        </div>

        <div className="space-y-4">
          {stepDrafts.map((step, idx) => (
            <div
              key={step.id}
              className="border rounded-2xl p-3 bg-card space-y-2"
            >
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold">
                  Step {idx + 1} – send after {step.delay_days} days
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold">Subject</label>
                <input
                  value={step.subject}
                  onChange={(e) => {
                    const copy = [...stepDrafts];
                    copy[idx].subject = e.target.value;
                    setStepDrafts(copy);
                  }}
                  readOnly={isLocked}
                  disabled={isLocked}
                  className="w-full border rounded-xl px-3 py-1.5 text-sm bg-background"
                  placeholder="Email subject line"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold">Body</label>
                <textarea
                  value={step.body}
                  onChange={(e) => {
                    const copy = [...stepDrafts];
                    copy[idx].body = e.target.value;
                    setStepDrafts(copy);
                  }}
                  rows={6}
                  readOnly={isLocked}
                  disabled={isLocked}
                  className="w-full border rounded-xl px-3 py-2 text-sm font-mono bg-background"
                  placeholder="Email body template"
                />
              </div>

              <div className="flex items-center gap-2">
                <label className="text-[11px] font-semibold">Delay (days):</label>
                <input
                  type="number"
                  min="0"
                  value={step.delay_days}
                  onChange={(e) => {
                    const copy = [...stepDrafts];
                    copy[idx].delay_days = parseInt(e.target.value) || 0;
                    setStepDrafts(copy);
                  }}
                  readOnly={isLocked}
                  disabled={isLocked}
                  className="w-20 border rounded-lg px-2 py-1 text-xs bg-background"
                />
              </div>

              {!isLocked && (
                <div className="text-[10px] text-gray-400">
                  Available placeholders:{" "}
                  <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">
                    {`{{contact.first_name}}`}
                  </code>
                  ,{" "}
                  <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">
                    {`{{city}}`}
                  </code>
                  ,{" "}
                  <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">
                    {`{{company.name}}`}
                  </code>
                  ,{" "}
                  <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">
                    {`{{sender.signature}}`}
                  </code>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-3">
          <button
            onClick={() => router.back()}
            className="px-4 py-2 rounded-xl border text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors"
          >
            Back
          </button>
          <button
            onClick={handleCreate}
            disabled={submitting || !campaignName.trim()}
            className={cn(
              "px-4 py-2 rounded-xl text-white text-sm font-semibold transition-opacity",
              submitting || !campaignName.trim()
                ? "bg-gray-400 opacity-40 cursor-not-allowed"
                : "bg-black dark:bg-white dark:text-black"
            )}
          >
            {submitting ? "Creating..." : isLocked ? "Create campaign → Upload leads" : "Create Campaign"}
          </button>
        </div>
      </div>
    </div>
  );
}

