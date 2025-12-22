"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardContent } from "@/components/ui/Card";
import { Textarea } from "@/components/ui/Textarea";
import { StepVariantsPanel } from "@/components/sequences/StepVariantsPanel";

function StepEditor({
  step,
  onChange,
}: {
  step: any;
  onChange: (s: any) => void;
}) {
  return (
    <div className="space-y-4">
      <Card className="rounded-2xl">
        <CardContent className="p-4 space-y-2">
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">Step #</label>
              <Input
                type="number"
                value={step.step_number}
                onChange={(e) =>
                  onChange({ ...step, step_number: +e.target.value })
                }
                min={1}
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-muted-foreground">Wait (days)</label>
              <Input
                type="number"
                value={step.wait_days}
                onChange={(e) =>
                  onChange({ ...step, wait_days: +e.target.value })
                }
                min={0}
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Subject</label>
            <Input
              placeholder="Subject"
              value={step.subject_template}
              onChange={(e) =>
                onChange({ ...step, subject_template: e.target.value })
              }
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">
              Body (markdown, supports {{first_name}}, {{company}}…)
            </label>
            <Textarea
              rows={6}
              placeholder="Body (markdown, supports {{first_name}}, {{company}}…)"
              value={step.body_md}
              onChange={(e) => onChange({ ...step, body_md: e.target.value })}
            />
          </div>
        </CardContent>
      </Card>
      {step.id && <StepVariantsPanel stepId={step.id} />}
    </div>
  );
}

export default function SequencesPage() {
  const [name, setName] = useState("Default 3-step");
  const [steps, setSteps] = useState<any[]>([
    {
      step_number: 1,
      wait_days: 0,
      subject_template: "Quick idea for {{company}}",
      body_md: "Hi {{first_name}},\n\nI noticed {{company}} is scaling. We help teams book more qualified calls. Interested in a 10-min chat?\n\n— Team",
    },
    {
      step_number: 2,
      wait_days: 2,
      subject_template: "{{first_name}}, worth a look?",
      body_md: "Circling back on my note about helping {{company}} scale outreach. Still interested?\n\n— Team",
    },
    {
      step_number: 3,
      wait_days: 4,
      subject_template: "Close the loop?",
      body_md: "If not you, who's the best person at {{company}} to chat about this?\n\n— Team",
    },
  ]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/sequences/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, steps }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Save failed");
      }

      const data = await res.json();
      setMessage(`Saved! Sequence ID: ${data.sequence_id}`);
    } catch (error: any) {
      setMessage(`Error: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const addStep = () => {
    const nextStep = Math.max(...steps.map((s) => s.step_number), 0) + 1;
    setSteps([
      ...steps,
      {
        step_number: nextStep,
        wait_days: 2,
        subject_template: "",
        body_md: "",
      },
    ]);
  };

  const removeStep = (index: number) => {
    setSteps(steps.filter((_, i) => i !== index));
  };

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Sequences</h1>

      <div className="max-w-2xl space-y-4">
        <div>
          <label className="text-sm font-medium">Sequence Name</label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="max-w-lg"
          />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">Steps</h2>
            <Button onClick={addStep} size="sm">
              + Add Step
            </Button>
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            {steps.map((s, i) => (
              <div key={i} className="relative">
                <StepEditor
                  step={s}
                  onChange={(ns) =>
                    setSteps([
                      ...steps.slice(0, i),
                      ns,
                      ...steps.slice(i + 1),
                    ])
                  }
                />
                {steps.length > 1 && (
                  <button
                    onClick={() => removeStep(i)}
                    className="absolute top-2 right-2 text-red-500 hover:text-red-700 text-xs"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <Button onClick={save} disabled={saving}>
          {saving ? "Saving..." : "Save Sequence"}
        </Button>

        {message && (
          <div
            className={`p-3 rounded-lg ${
              message.startsWith("Error")
                ? "bg-red-50 text-red-700"
                : "bg-green-50 text-green-700"
            }`}
          >
            {message}
          </div>
        )}
      </div>
    </div>
  );
}

