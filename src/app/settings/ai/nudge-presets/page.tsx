"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type NudgePreset = {
  id: string;
  owner_id: string;
  label: string;
  tone: string;
  prompt: string;
  weight: number;
  success_count: number;
  fail_count: number;
  last_used_at: string | null;
  is_active: boolean;
};

const LABEL_TITLES: Record<string, string> = {
  positive: "Positive",
  neutral: "Neutral",
  objection: "Objection",
  meeting_intent: "Meeting Intent",
  no_response: "No Response"
};

const TONE_TITLES: Record<string, string> = {
  friendly: "Friendly",
  direct: "Direct",
  concise: "Concise",
  empathetic: "Empathetic",
  persistent: "Persistent"
};

const STARTER_PRESETS = [
  {
    label: "positive",
    tone: "friendly",
    prompt: "Follow up warmly to confirm next steps.",
    weight: 1
  },
  {
    label: "neutral",
    tone: "direct",
    prompt: "Send a crisp nudge to re-ignite interest.",
    weight: 1
  },
  {
    label: "objection",
    tone: "empathetic",
    prompt: "Acknowledge concern and gently re-frame.",
    weight: 1
  },
  {
    label: "meeting_intent",
    tone: "concise",
    prompt: "Confirm and calendar-lock.",
    weight: 1
  },
  {
    label: "no_response",
    tone: "persistent",
    prompt: "Respectfully re-engage after silence.",
    weight: 1
  }
] satisfies Array<Pick<NudgePreset, "label" | "tone" | "prompt" | "weight">>;

export default function NudgePresetsPage() {
  const supabase = useMemo(() => createClientComponentClient(), []);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [presets, setPresets] = useState<NudgePreset[]>([]);
  const [editPreset, setEditPreset] = useState<NudgePreset | null>(null);
  const [editPrompt, setEditPrompt] = useState("");
  const [editWeight, setEditWeight] = useState<number>(1);
  const [actionId, setActionId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        console.error("Failed to load user", error);
        toast.error("Unable to load session. Refresh and try again.");
        return;
      }
      const uid = data.user?.id ?? null;
      setUserId(uid);
      if (uid) {
        await loadPresets();
      } else {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  async function loadPresets() {
    setLoading(true);
    const { data, error } = await supabase
      .from("nudge_tuner")
      .select(
        "id, owner_id, label, tone, prompt, weight, success_count, fail_count, last_used_at, is_active"
      )
      .order("label", { ascending: true })
      .order("weight", { ascending: false });

    if (error) {
      console.error("Failed to load nudge presets", error);
      toast.error("Failed to load presets");
      setPresets([]);
    } else {
      setPresets(data as NudgePreset[]);
    }

    setLoading(false);
  }

  function openEdit(preset: NudgePreset) {
    setEditPreset(preset);
    setEditPrompt(preset.prompt);
    setEditWeight(preset.weight);
  }

  async function saveEdit() {
    if (!editPreset) return;
    setActionId(editPreset.id);

    const { error } = await supabase
      .from("nudge_tuner")
      .update({
        prompt: editPrompt.trim(),
        weight: Math.max(0.1, Number(editWeight) || editPreset.weight)
      })
      .eq("id", editPreset.id);

    if (error) {
      console.error("Failed to update preset", error);
      toast.error("Failed to update preset");
    } else {
      toast.success("Preset updated");
      await loadPresets();
      setEditPreset(null);
    }

    setActionId(null);
  }

  async function toggleActive(preset: NudgePreset) {
    setActionId(preset.id);
    const { error } = await supabase
      .from("nudge_tuner")
      .update({ is_active: !preset.is_active })
      .eq("id", preset.id);

    if (error) {
      console.error("Failed to toggle preset", error);
      toast.error("Failed to update preset");
    } else {
      toast.success(preset.is_active ? "Preset deactivated" : "Preset activated");
      await loadPresets();
    }

    setActionId(null);
  }

  async function clonePreset(preset: NudgePreset) {
    if (!userId) {
      toast.error("Sign in to clone presets.");
      return;
    }

    setActionId(preset.id);
    const { error } = await supabase.from("nudge_tuner").insert({
      owner_id: userId,
      label: preset.label,
      tone: preset.tone,
      prompt: preset.prompt,
      weight: preset.weight,
      is_active: false,
      success_count: 0,
      fail_count: 0
    });

    if (error) {
      console.error("Failed to clone preset", error);
      toast.error("Clone failed");
    } else {
      toast.success("Preset cloned");
      await loadPresets();
    }

    setActionId(null);
  }

  async function createStarterPresets() {
    if (!userId) {
      toast.error("Sign in to add presets.");
      return;
    }

    setActionId("seed");
    const payload = STARTER_PRESETS.map((preset) => ({
      ...preset,
      owner_id: userId,
      is_active: true,
      success_count: 0,
      fail_count: 0
    }));

    const { error } = await supabase.from("nudge_tuner").insert(payload);
    if (error) {
      console.error("Failed to add starter presets", error);
      toast.error("Could not add starter presets");
    } else {
      toast.success("Starter presets added");
      await loadPresets();
    }
    setActionId(null);
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Nudge Presets</h1>
          <p className="text-muted-foreground">
            Weighted presets decay nightly. Reinforce winners by boosting weight or logging successes.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/inbox">Back to Inbox</Link>
        </Button>
      </div>

      {!userId && (
        <Card>
          <CardHeader>
            <CardTitle>Sign in required</CardTitle>
            <CardDescription>Log in to manage your nudge presets.</CardDescription>
          </CardHeader>
        </Card>
      )}

      {userId && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Presets</CardTitle>
              <CardDescription>
                Higher weight increases selection odds. Success and fail counts drive reinforcement rules.
              </CardDescription>
            </div>
            <Badge variant="outline">Nightly decay @ 02:00 UTC</Badge>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-12 text-center text-muted-foreground text-sm">Loading presets…</div>
            ) : presets.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-sm space-y-4">
                <p>No presets yet. Add the starter pack or craft your own variants.</p>
                <Button onClick={createStarterPresets} disabled={actionId === "seed"}>
                  Add Starter Presets
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      <th className="border-b px-3 py-2 font-medium">Label</th>
                      <th className="border-b px-3 py-2 font-medium">Tone</th>
                      <th className="border-b px-3 py-2 font-medium">Weight</th>
                      <th className="border-b px-3 py-2 font-medium">Success</th>
                      <th className="border-b px-3 py-2 font-medium">Fail</th>
                      <th className="border-b px-3 py-2 font-medium">Last Used</th>
                      <th className="border-b px-3 py-2 font-medium">Active</th>
                      <th className="border-b px-3 py-2 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {presets.map((preset) => (
                      <tr key={preset.id} className="border-b last:border-b-0">
                        <td className="px-3 py-2 font-medium">
                          {LABEL_TITLES[preset.label] ?? preset.label}
                        </td>
                        <td className="px-3 py-2">{TONE_TITLES[preset.tone] ?? preset.tone}</td>
                        <td className="px-3 py-2">{preset.weight.toFixed(2)}</td>
                        <td className="px-3 py-2">{preset.success_count}</td>
                        <td className="px-3 py-2">{preset.fail_count}</td>
                        <td className="px-3 py-2">
                          {preset.last_used_at
                            ? new Date(preset.last_used_at).toLocaleString()
                            : "—"}
                        </td>
                        <td className="px-3 py-2">
                          {preset.is_active ? (
                            <Badge variant="secondary">Active</Badge>
                          ) : (
                            <Badge variant="outline">Paused</Badge>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openEdit(preset)}
                              disabled={actionId === preset.id}
                            >
                              Edit Prompt
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => clonePreset(preset)}
                              disabled={actionId === preset.id}
                            >
                              Clone
                            </Button>
                            <Button
                              variant={preset.is_active ? "outline" : "default"}
                              size="sm"
                              onClick={() => toggleActive(preset)}
                              disabled={actionId === preset.id}
                            >
                              {preset.is_active ? "Deactivate" : "Activate"}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={!!editPreset} onOpenChange={(open) => !open && setEditPreset(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit Prompt</DialogTitle>
          </DialogHeader>
          {editPreset && (
            <div className="space-y-4">
              <div>
                <div className="text-xs font-medium text-muted-foreground uppercase mb-1">
                  Label • Tone
                </div>
                <div className="text-sm font-semibold">
                  {LABEL_TITLES[editPreset.label] ?? editPreset.label} •{" "}
                  {TONE_TITLES[editPreset.tone] ?? editPreset.tone}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground uppercase">
                  Prompt
                </label>
                <Textarea
                  rows={6}
                  value={editPrompt}
                  onChange={(e) => setEditPrompt(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground uppercase">
                  Weight
                </label>
                <Input
                  type="number"
                  step="0.05"
                  min="0.1"
                  value={editWeight}
                  onChange={(e) => setEditWeight(parseFloat(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  Decays 3% nightly. Values below 0.1 are clamped.
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditPreset(null)}>
              Cancel
            </Button>
            <Button
              onClick={saveEdit}
              disabled={!editPreset || actionId === editPreset.id}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


