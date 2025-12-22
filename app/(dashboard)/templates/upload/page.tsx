"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Step = {
  subject: string;
  body: string;
  delay_hours: number;
};

export default function CreateTemplatePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [persona, setPersona] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("private");
  const [steps, setSteps] = useState<Step[]>([
    { subject: "", body: "", delay_hours: 0 },
  ]);
  const [saving, setSaving] = useState(false);

  const addStep = () => {
    setSteps([...steps, { subject: "", body: "", delay_hours: 0 }]);
  };

  const removeStep = (index: number) => {
    if (steps.length > 1) {
      setSteps(steps.filter((_, i) => i !== index));
    }
  };

  const updateStep = (index: number, field: keyof Step, value: string | number) => {
    const newSteps = [...steps];
    newSteps[index] = { ...newSteps[index], [field]: value };
    setSteps(newSteps);
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      alert("Template name is required");
      return;
    }

    if (steps.some((s) => !s.subject.trim() || !s.body.trim())) {
      alert("All steps must have a subject and body");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/templates/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          persona: persona.trim() || null,
          visibility,
          steps,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        router.push(`/templates/${data.template_id}`);
      } else {
        const error = await res.json();
        alert(error.error || "Failed to create template");
      }
    } catch (error) {
      alert("Failed to create template");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Upload New Template</h1>

      <Card>
        <CardHeader>
          <CardTitle>Template Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Template Name *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., SMB Cold Outreach 4-Step"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what this template is for..."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="persona">Persona (optional)</Label>
            <Input
              id="persona"
              value={persona}
              onChange={(e) => setPersona(e.target.value)}
              placeholder="e.g., SMB, Founder, Agency"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="visibility">Visibility</Label>
            <Select
              value={visibility}
              onValueChange={(value: "public" | "private") =>
                setVisibility(value)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="private">Private (Your workspace only)</SelectItem>
                <SelectItem value="public">Public (Share with everyone)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Sequence Steps</CardTitle>
            <Button variant="outline" onClick={addStep}>
              Add Step
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {steps.map((step, index) => (
            <div key={index} className="border rounded-lg p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Step {index + 1}</h3>
                {steps.length > 1 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => removeStep(index)}
                    className="text-red-500"
                  >
                    Remove
                  </Button>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor={`delay-${index}`}>
                  Delay Hours (after previous step)
                </Label>
                <Input
                  id={`delay-${index}`}
                  type="number"
                  min="0"
                  value={step.delay_hours}
                  onChange={(e) =>
                    updateStep(index, "delay_hours", parseInt(e.target.value) || 0)
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor={`subject-${index}`}>Subject *</Label>
                <Input
                  id={`subject-${index}`}
                  value={step.subject}
                  onChange={(e) =>
                    updateStep(index, "subject", e.target.value)
                  }
                  placeholder="Email subject line"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor={`body-${index}`}>Body *</Label>
                <Textarea
                  id={`body-${index}`}
                  value={step.body}
                  onChange={(e) => updateStep(index, "body", e.target.value)}
                  placeholder="Email body content"
                  rows={6}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button onClick={handleSubmit} disabled={saving}>
          {saving ? "Publishing..." : "Publish Template"}
        </Button>
        <Button variant="outline" onClick={() => router.back()} disabled={saving}>
          Cancel
        </Button>
      </div>
    </div>
  );
}



