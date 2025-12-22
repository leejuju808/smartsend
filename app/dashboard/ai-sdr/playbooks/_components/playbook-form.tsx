"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createBrowserClient } from "@supabase/ssr";

type Playbook = {
  id?: string;
  name: string;
  description?: string;
  target_persona?: string;
  primary_goal?: string;
  approach_style?: "soft" | "balanced" | "direct";
  messaging_guidelines?: string;
  objection_handling_guidelines?: string;
  closing_style?: string;
  config?: Record<string, any>;
};

export default function PlaybookForm({
  userId,
  playbook,
}: {
  userId: string;
  playbook?: Playbook;
}) {
  const router = useRouter();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState<Playbook>({
    name: playbook?.name || "",
    description: playbook?.description || "",
    target_persona: playbook?.target_persona || "",
    primary_goal: playbook?.primary_goal || "",
    approach_style: playbook?.approach_style || "balanced",
    messaging_guidelines: playbook?.messaging_guidelines || "",
    objection_handling_guidelines: playbook?.objection_handling_guidelines || "",
    closing_style: playbook?.closing_style || "",
    config: playbook?.config || {},
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const payload = {
        user_id: userId,
        name: formData.name,
        description: formData.description || null,
        target_persona: formData.target_persona || null,
        primary_goal: formData.primary_goal || null,
        approach_style: formData.approach_style || "balanced",
        messaging_guidelines: formData.messaging_guidelines || null,
        objection_handling_guidelines: formData.objection_handling_guidelines || null,
        closing_style: formData.closing_style || null,
        config: formData.config || {},
      };

      if (playbook?.id) {
        const { error } = await supabase
          .from("ai_sdr_playbooks")
          .update(payload)
          .eq("id", playbook.id)
          .eq("user_id", userId);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("ai_sdr_playbooks")
          .insert(payload);

        if (error) throw error;
      }

      router.push("/dashboard/ai-sdr/playbooks");
      router.refresh();
    } catch (error: any) {
      console.error("Error saving playbook:", error);
      alert(error.message || "Failed to save playbook");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="name">Name *</Label>
        <Input
          id="name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          required
          placeholder="e.g., B2B SaaS Founders Playbook"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) =>
            setFormData({ ...formData, description: e.target.value })
          }
          rows={2}
          placeholder="Brief description of this playbook"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="target_persona">Target Persona</Label>
        <Input
          id="target_persona"
          value={formData.target_persona}
          onChange={(e) =>
            setFormData({ ...formData, target_persona: e.target.value })
          }
          placeholder="e.g., US-based home services owners, B2B SaaS founders 10–50 employees"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="primary_goal">Primary Goal</Label>
        <Input
          id="primary_goal"
          value={formData.primary_goal}
          onChange={(e) =>
            setFormData({ ...formData, primary_goal: e.target.value })
          }
          placeholder="e.g., book 15-minute demo, get reply with interest"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="approach_style">Approach Style</Label>
        <Select
          value={formData.approach_style}
          onValueChange={(value: "soft" | "balanced" | "direct") =>
            setFormData({ ...formData, approach_style: value })
          }
        >
          <SelectTrigger id="approach_style">
            <SelectValue placeholder="Select approach style" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="soft">Soft</SelectItem>
            <SelectItem value="balanced">Balanced</SelectItem>
            <SelectItem value="direct">Direct</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          How aggressive/soft to be in outreach
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="messaging_guidelines">Messaging Guidelines</Label>
        <Textarea
          id="messaging_guidelines"
          value={formData.messaging_guidelines}
          onChange={(e) =>
            setFormData({ ...formData, messaging_guidelines: e.target.value })
          }
          rows={6}
          placeholder="Long-form guidelines that become part of system prompt. Describe your messaging angle, key talking points, value props, etc."
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="objection_handling_guidelines">Objection Handling Guidelines</Label>
        <Textarea
          id="objection_handling_guidelines"
          value={formData.objection_handling_guidelines}
          onChange={(e) =>
            setFormData({
              ...formData,
              objection_handling_guidelines: e.target.value,
            })
          }
          rows={6}
          placeholder="How to handle common objections. What to say when leads say 'not interested', 'too expensive', 'not the right time', etc."
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="closing_style">Closing Style</Label>
        <Textarea
          id="closing_style"
          value={formData.closing_style}
          onChange={(e) =>
            setFormData({ ...formData, closing_style: e.target.value })
          }
          rows={3}
          placeholder="e.g., always propose 2 times, ask open-ended question, use assumptive close"
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={saving}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : playbook?.id ? "Update Playbook" : "Create Playbook"}
        </Button>
      </div>
    </form>
  );
}

