// app/dashboard/campaigns/_components/CampaignSequenceClient.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Campaign = {
  id: string;
  workspace_id: string;
  name: string;
  status: string;
  created_at: string;
};

type StepRow = {
  id: string;
  campaign_id: string;
  step_order: number;
  delay_days: number;
  subject: string;
  body: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

interface Props {
  campaign: Campaign;
  steps: StepRow[];
}

type NewStepForm = {
  subject: string;
  body: string;
  delayDays: string;
};

type RoofingTemplate = {
  key: string;
  label: string;
  bestFor: string;
  defaultDelayDays: number;
  subject: string;
  body: string;
};

// 🔥 Roofing-specific presets
const ROOFING_TEMPLATES: RoofingTemplate[] = [
  {
    key: "roof_inspection_intro",
    label: "Step 1 – Free Roof Inspection Offer",
    bestFor: "First touch to cold homeowners",
    defaultDelayDays: 0,
    subject: "Quick question about your roof in {{city}}",
    body: `Hey {{first_name}},

I'm {{sender_name}} with {{company_name}} here in {{city}}. We've been helping homeowners in your area with roof inspections and replacements, especially after the last couple seasons of wind and rain.

Right now we're offering a **no-pressure, free roof inspection** for homes in {{neighborhood}}. We check for:

- Hidden leaks and soft spots

- Missing or cracked shingles

- Storm and hail damage that could void insurance later

If we find anything, we'll show you photos and a clear estimate. If everything looks good, we'll say so and be on our way.

Would you be open to a quick **10–15 minute inspection** sometime next week?

Best,  
{{sender_name}}  
{{company_name}}  
{{sender_phone}}`,
  },
  {
    key: "inspection_followup",
    label: "Step 2 – Follow-Up On Inspection",
    bestFor: "Follow-up 2–3 days after Step 1",
    defaultDelayDays: 2,
    subject: "Still happy to check your roof for free",
    body: `Hey {{first_name}},

Wanted to quickly follow up on my last email about the **free roof inspection** we're offering in {{city}}.

We're already scheduled to be in your area doing work on a few homes, so it's easy for us to swing by and:

- Check for any damage or early leaks  

- Take photos you can keep for your records or insurance  

- Give you a clear, written estimate if anything needs attention  

Most homeowners use this just to know where they stand before winter or the next storm.

Would you like me to hold a spot for **this week or next**?

Best,  
{{sender_name}}  
{{company_name}}`,
  },
  {
    key: "estimate_push",
    label: "Step 3 – Direct Estimate Push",
    bestFor: "Warm leads / last nudge",
    defaultDelayDays: 3,
    subject: "We can lock in your roof estimate this week",
    body: `Hey {{first_name}},

I know life gets busy, so I wanted to send one last quick note.

We're locking in our **current pricing** for roof work in {{city}} before material costs change again. If you've been thinking about:

- Full roof replacement  

- Repairing an active leak  

- Upgrading to longer-lasting shingles  

We can come out, inspect, and give you a **written estimate** at no cost. Most visits take less than 30 minutes.

If you reply with **"ESTIMATE"** and your preferred day/time window, I'll personally make sure we get you on the schedule.

Talk soon,  
{{sender_name}}  
{{company_name}}`,
  },
  {
    key: "past_customer_checkin",
    label: "Reactivation – Past Customer Check-In",
    bestFor: "Old customer lists",
    defaultDelayDays: 0,
    subject: "Quick roof check-in from {{company_name}}",
    body: `Hey {{first_name}},

This is {{sender_name}} from {{company_name}}. We helped with your roof project in the past and just wanted to check in.

We're offering **past customers** a quick health check on their roof:

- Inspect for new wear and tear  

- Check flashing, vents, and seals  

- Make sure everything is ready for the next season  

If you'd like us to stop by for a quick look, just reply **"CHECK"** and what days usually work best for you.

Appreciate you,  
{{sender_name}}  
{{company_name}}`,
  },
];

function statusBadge(status: string) {
  const base =
    "inline-flex items-center rounded-full border px-2 py-[2px] text-[10px] font-medium uppercase tracking-wide";
  if (status === "active") {
    return `${base} border-emerald-600 bg-emerald-500/10 text-emerald-700`;
  }
  if (status === "paused") {
    return `${base} border-yellow-500 bg-yellow-500/10 text-yellow-700`;
  }
  if (status === "archived") {
    return `${base} border-gray-500 bg-gray-500/10 text-gray-400`;
  }
  return `${base} border-blue-600 bg-blue-500/10 text-blue-700`;
}

export default function CampaignSequenceClient({ campaign, steps }: Props) {
  const router = useRouter();
  const [isCreating, startCreate] = useTransition();
  const [isUpdating, startUpdate] = useTransition();
  const [form, setForm] = useState<NewStepForm>({
    subject: "",
    body: "",
    delayDays: "0",
  });

  function updateField<K extends keyof NewStepForm>(
    key: K,
    value: NewStepForm[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function applyTemplate(t: RoofingTemplate) {
    setForm((prev) => ({
      ...prev,
      subject: t.subject,
      body: t.body,
      delayDays:
        prev.delayDays.trim() === "" && steps.length > 0
          ? String(t.defaultDelayDays)
          : prev.delayDays,
    }));
  }

  async function createStep() {
    if (!form.subject.trim() || !form.body.trim()) return;

    startCreate(async () => {
      try {
        const delayDays =
          form.delayDays.trim() === ""
            ? 0
            : Number.parseInt(form.delayDays, 10) || 0;

        const res = await fetch("/api/campaigns/steps/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            campaignId: campaign.id,
            subject: form.subject.trim(),
            body: form.body.trim(),
            delayDays,
          }),
        });

        if (!res.ok) {
          console.error("Failed to create step", await res.text());
          return;
        }

        setForm({ subject: "", body: "", delayDays: "0" });
        router.refresh();
      } catch (err) {
        console.error("Error creating step", err);
      }
    });
  }

  async function toggleEnabled(stepId: string, next: boolean) {
    startUpdate(async () => {
      try {
        const res = await fetch("/api/campaigns/steps/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: stepId,
            enabled: next,
          }),
        });

        if (!res.ok) {
          console.error("Failed to update step", await res.text());
          return;
        }

        router.refresh();
      } catch (err) {
        console.error("Error updating step", err);
      }
    });
  }

  async function updateDelay(stepId: string, delayDays: number) {
    startUpdate(async () => {
      try {
        const res = await fetch("/api/campaigns/steps/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: stepId,
            delayDays,
          }),
        });

        if (!res.ok) {
          console.error("Failed to update delay", await res.text());
          return;
        }

        router.refresh();
      } catch (err) {
        console.error("Error updating delay", err);
      }
    });
  }

  return (
    <div className="flex h-full flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              {campaign.name} — Sequence
            </h1>
            <span className={statusBadge(campaign.status)}>
              {campaign.status}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            Define the series of emails SmartSend will send for this campaign.
          </p>
        </div>

        <Link
          href={`/dashboard/campaigns/${campaign.id}`}
          className="text-xs font-medium underline-offset-2 hover:underline"
        >
          ← Back to campaign
        </Link>
      </header>

      <main className="grid gap-6 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1.4fr)]">
        {/* Left: Sequence steps list */}
        <section className="flex flex-col gap-3 rounded-2xl border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">Steps in this sequence</h2>
            <span className="text-[11px] text-muted-foreground">
              {steps.length} step{steps.length === 1 ? "" : "s"}
            </span>
          </div>

          {steps.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No steps yet. Start with a strong opener, then add follow-ups with
              delays in days.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {steps.map((step) => (
                <article
                  key={step.id}
                  className="rounded-xl border bg-background px-3 py-2 text-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col gap-[2px]">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-semibold">
                          Step {step.step_order}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          Delay: {step.delay_days} day
                          {step.delay_days === 1 ? "" : "s"}
                        </span>
                      </div>
                      <p className="text-[11px] font-medium">
                        {step.subject}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <button
                        type="button"
                        className={`rounded-full border px-2 py-[2px] text-[10px] font-medium ${
                          step.enabled
                            ? "border-emerald-600 bg-emerald-500/10 text-emerald-700"
                            : "border-gray-500 bg-gray-500/10 text-gray-400"
                        }`}
                        disabled={isUpdating}
                        onClick={() => toggleEnabled(step.id, !step.enabled)}
                      >
                        {step.enabled ? "Enabled" : "Disabled"}
                      </button>
                      <input
                        type="number"
                        min={0}
                        max={365}
                        step={1}
                        className="w-20 rounded-md border bg-background px-2 py-[3px] text-[10px] outline-none ring-0 focus:border-primary"
                        value={step.delay_days}
                        onChange={(e) =>
                          updateDelay(
                            step.id,
                            Number.parseInt(e.target.value || "0", 10)
                          )
                        }
                        disabled={isUpdating}
                      />
                    </div>
                  </div>
                  <p className="mt-1 line-clamp-3 text-[11px] text-muted-foreground">
                    {step.body}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>

        {/* Right: New step composer + Roofing template library */}
        <section className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-sm">
          {/* Composer */}
          <div className="flex flex-col gap-3">
            <h2 className="text-sm font-medium">Add new step</h2>
            <p className="text-[11px] text-muted-foreground">
              You can type from scratch or click a roofing template below and
              we'll drop it in here.
            </p>

            <div className="flex flex-col gap-3 text-xs">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium">Subject</label>
                <input
                  type="text"
                  className="w-full rounded-lg border bg-background px-3 py-2 text-xs outline-none ring-0 focus:border-primary"
                  placeholder="e.g. Quick question about your roof in Lacey"
                  value={form.subject}
                  onChange={(e) => updateField("subject", e.target.value)}
                  disabled={isCreating}
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium">
                  Body (email content)
                </label>
                <textarea
                  className="min-h-[160px] w-full resize-none rounded-lg border bg-background px-3 py-2 text-xs outline-none ring-0 focus:border-primary"
                  placeholder={`Example:



Hey {{first_name}},



Saw you're in {{city}} and wanted to reach out about your roof...`}
                  value={form.body}
                  onChange={(e) => updateField("body", e.target.value)}
                  disabled={isCreating}
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium">
                  Delay after previous step (days)
                </label>
                <input
                  type="number"
                  min={0}
                  max={365}
                  step={1}
                  className="w-full rounded-lg border bg-background px-3 py-2 text-xs outline-none ring-0 focus:border-primary"
                  placeholder="0 = send immediately as first step"
                  value={form.delayDays}
                  onChange={(e) => updateField("delayDays", e.target.value)}
                  disabled={isCreating}
                />
                <span className="text-[10px] text-muted-foreground">
                  Step 1 will always fire first; later steps use this delay
                  after the previous email.
                </span>
              </div>
            </div>

            <div className="mt-1 flex items-center justify-between border-t pt-3 text-[11px]">
              <span className="text-[10px] text-muted-foreground">
                Keep it simple: 3–5 strong steps beat a 15-email wall.
              </span>
              <button
                type="button"
                disabled={
                  isCreating || !form.subject.trim() || !form.body.trim()
                }
                onClick={createStep}
                className="rounded-full bg-primary px-4 py-[6px] text-[11px] font-medium text-primary-foreground shadow-sm transition hover:-translate-y-[0.5px] hover:shadow disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isCreating ? "Adding…" : "Add step"}
              </button>
            </div>
          </div>

          {/* Roofing Template Library */}
          <div className="mt-2 flex flex-col gap-2 border-t pt-3">
            <h3 className="text-xs font-semibold">
              Roofing Template Library
            </h3>
            <p className="text-[10px] text-muted-foreground">
              Click any preset to instantly load a proven roofing email into the
              composer. Edit the {{tokens}} to match your campaign.
            </p>

            <div className="mt-1 flex flex-col gap-2 text-xs">
              {ROOFING_TEMPLATES.map((t) => (
                <article
                  key={t.key}
                  className="rounded-xl border bg-background px-3 py-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col gap-[2px]">
                      <span className="text-[11px] font-medium">
                        {t.label}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        Best for: {t.bestFor}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        Default delay: {t.defaultDelayDays} day
                        {t.defaultDelayDays === 1 ? "" : "s"}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => applyTemplate(t)}
                      className="rounded-full border border-blue-600 bg-blue-500/10 px-3 py-[4px] text-[10px] font-medium text-blue-700 transition hover:-translate-y-[0.5px] hover:shadow-sm"
                    >
                      Use this
                    </button>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[10px] text-muted-foreground">
                    {t.subject}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

