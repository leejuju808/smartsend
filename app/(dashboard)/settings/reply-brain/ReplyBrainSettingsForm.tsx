"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";

export function ReplyBrainSettingsForm({ 
  accountId, 
  initialPolicy 
}: { 
  accountId: string;
  initialPolicy?: { min_confidence: number; auto_actions: string[]; route_actions: string[] } | null;
}) {
  const router = useRouter();
  const [minConfidence, setMinConfidence] = useState(
    initialPolicy?.min_confidence?.toString() || "0.65"
  );
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);

    try {
      const sb = createClient();
      const { error } = await sb
        .from("reply_brain_policy")
        .upsert({
          account_id: accountId,
          min_confidence: parseFloat(minConfidence),
          auto_actions: ['auto_unsubscribe', 'send_followup_a', 'send_followup_b', 'mark_bounce'],
          route_actions: ['schedule_meeting', 'create_task', 'route_to_human']
        });

      if (error) throw error;

      router.refresh();
    } catch (error) {
      console.error("Failed to save policy:", error);
      alert("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    try {
      const res = await fetch("/api/reply-brain/test", {
        method: "POST",
      });
      const json = await res.json();
      alert(`Test result: ${JSON.stringify(json, null, 2)}`);
    } catch (error) {
      console.error("Test failed:", error);
      alert("Test failed");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-6">
      <div className="grid gap-2">
        <Label htmlFor="min_confidence">Minimum Confidence Threshold</Label>
        <Input
          id="min_confidence"
          name="min_confidence"
          type="number"
          step="0.01"
          min="0"
          max="1"
          value={minConfidence}
          onChange={(e) => setMinConfidence(e.target.value)}
          placeholder="0.65"
        />
        <p className="text-sm text-muted-foreground">
          Only auto-apply actions when confidence is above this threshold (0.0 - 1.0)
        </p>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save Settings"}
        </Button>
        <Button 
          type="button" 
          variant="secondary" 
          onClick={handleTest}
        >
          Run Test
        </Button>
      </div>
    </form>
  );
}















