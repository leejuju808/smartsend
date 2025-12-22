"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Textarea } from "@/components/ui/Textarea";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/label";

type FollowUpData = {
  wait_days: number;
  subject: string;
  body: string;
};

type FollowUpBuilderProps = {
  campaignId: string;
  initialStep2?: FollowUpData;
  initialStep3?: FollowUpData;
};

export function FollowUpBuilder({ campaignId, initialStep2, initialStep3 }: FollowUpBuilderProps) {
  const [step2, setStep2] = React.useState<FollowUpData>({
    wait_days: initialStep2?.wait_days || 2,
    subject: initialStep2?.subject || "",
    body: initialStep2?.body || "",
  });

  const [step3, setStep3] = React.useState<FollowUpData>({
    wait_days: initialStep3?.wait_days || 2,
    subject: initialStep3?.subject || "",
    body: initialStep3?.body || "",
  });

  const [saving, setSaving] = React.useState<"idle" | "saving" | "saved">("idle");

  const saveFollowUps = React.useCallback(async () => {
    setSaving("saving");
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/followups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step2: step2.subject && step2.body ? step2 : null,
          step3: step3.subject && step3.body ? step3 : null,
        }),
      });
      if (!res.ok) {
        const error = await res.text();
        throw new Error(error || "Failed to save follow-ups");
      }
      setSaving("saved");
      setTimeout(() => setSaving("idle"), 2000);
    } catch (e: any) {
      setSaving("idle");
      console.error("Save error:", e);
      alert(e?.message || "Failed to save follow-ups");
    }
  }, [campaignId, step2, step3]);

  // Debounced autosave
  React.useEffect(() => {
    const t = setTimeout(() => {
      if (step2.subject && step2.body) {
        saveFollowUps();
      } else if (step3.subject && step3.body) {
        saveFollowUps();
      }
    }, 1000);
    return () => clearTimeout(t);
  }, [step2, step3, saveFollowUps]);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-2">Follow-Up Sequence</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Automatically send follow-up emails when homeowners don't reply. Step 1 is your initial email.
        </p>
      </div>

      {/* Step 2 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Step 2 — First Follow-Up</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="step2-wait">Wait (days)</Label>
              <Input
                id="step2-wait"
                type="number"
                min={1}
                max={30}
                value={step2.wait_days}
                onChange={(e) =>
                  setStep2({ ...step2, wait_days: parseInt(e.target.value) || 2 })
                }
              />
            </div>
            <div className="flex items-end">
              <p className="text-xs text-muted-foreground">
                {saving === "saving" ? "Saving…" : saving === "saved" ? "Saved" : ""}
              </p>
            </div>
          </div>

          <div>
            <Label htmlFor="step2-subject">Subject</Label>
            <Input
              id="step2-subject"
              value={step2.subject}
              onChange={(e) => setStep2({ ...step2, subject: e.target.value })}
              placeholder="Re: {{subject}}"
            />
          </div>

          <div>
            <Label htmlFor="step2-body">Body</Label>
            <Textarea
              id="step2-body"
              rows={8}
              value={step2.body}
              onChange={(e) => setStep2({ ...step2, body: e.target.value })}
              placeholder="Hi {{first_name|there}},\n\nJust following up on my previous email..."
            />
          </div>
        </CardContent>
      </Card>

      {/* Step 3 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Step 3 — Final Follow-Up</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="step3-wait">Wait (days)</Label>
              <Input
                id="step3-wait"
                type="number"
                min={1}
                max={30}
                value={step3.wait_days}
                onChange={(e) =>
                  setStep3({ ...step3, wait_days: parseInt(e.target.value) || 2 })
                }
              />
            </div>
            <div className="flex items-end">
              <p className="text-xs text-muted-foreground">
                {saving === "saving" ? "Saving…" : saving === "saved" ? "Saved" : ""}
              </p>
            </div>
          </div>

          <div>
            <Label htmlFor="step3-subject">Subject</Label>
            <Input
              id="step3-subject"
              value={step3.subject}
              onChange={(e) => setStep3({ ...step3, subject: e.target.value })}
              placeholder="Last try: {{subject}}"
            />
          </div>

          <div>
            <Label htmlFor="step3-body">Body</Label>
            <Textarea
              id="step3-body"
              rows={8}
              value={step3.body}
              onChange={(e) => setStep3({ ...step3, body: e.target.value })}
              placeholder="Hi {{first_name|there}},\n\nThis is my final follow-up..."
            />
          </div>
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground bg-blue-50 border border-blue-200 rounded-lg p-3">
        <p className="font-medium mb-1">💡 How it works:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>Step 1 = your initial campaign email (sent immediately)</li>
          <li>If no reply after X days → auto-send Step 2</li>
          <li>If still no reply after X more days → auto-send Step 3</li>
          <li>If they reply → all follow-ups stop automatically</li>
        </ul>
      </div>
    </div>
  );
}

























































