"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  rewritePresetSchema,
  type RewritePresetInput,
  type RewritePresetConfig,
} from "@/lib/templates/rewrite-schema";
import { saveRewritePreset } from "@/app/api/rewrite-presets/save/actions";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

type FormValues = RewritePresetInput;

interface RewritePresetFormProps {
  accountId: string;
  ownerId: string;
  initial?: FormValues | null;
  onSaved?: (preset: any) => void;
  onCancel?: () => void;
}

const DEFAULT_CONFIG: RewritePresetConfig = {
  mode: "shorter",
  tone: "friendly",
  max_words: 140,
  instructions: "Make this email shorter, punchier, and focused on outcomes.",
};

export function RewritePresetForm({
  accountId,
  ownerId,
  initial,
  onSaved,
  onCancel,
}: RewritePresetFormProps) {
  const form = useForm<FormValues>({
    resolver: zodResolver(rewritePresetSchema),
    defaultValues: initial ?? {
      id: undefined,
      account_id: accountId,
      owner_id: ownerId,
      name: "",
      description: "",
      config: DEFAULT_CONFIG,
    },
  });

  const [saving, setSaving] = React.useState(false);

  async function onSubmit(values: FormValues) {
    setSaving(true);
    try {
      const payload: FormValues = {
        ...values,
        account_id: accountId,
        owner_id: ownerId,
      };
      const result = await saveRewritePreset(payload);
      toast.success("Rewrite preset saved");
      if (onSaved) onSaved(result);
    } catch (err) {
      console.error(err);
      toast.error("Failed to save preset");
    } finally {
      setSaving(false);
    }
  }

  const config = form.watch("config");

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <label className="block text-sm font-medium">Preset name</label>
          <Input
            {...form.register("name")}
            placeholder='e.g. "Short & punchy — warm"'
          />
          <p className="text-xs text-muted-foreground">
            Choose a name you'll recognize quickly in the composer.
          </p>
        </div>
        <div className="space-y-1">
          <label className="block text-sm font-medium">Description</label>
          <Input
            {...form.register("description")}
            placeholder="Optional: add context for your team"
          />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1">
          <label className="block text-sm font-medium">Mode</label>
          <Select
            value={config.mode}
            onValueChange={(val) =>
              form.setValue("config.mode", val as RewritePresetConfig["mode"])
            }
          >
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="shorter">Shorter & tighter</SelectItem>
              <SelectItem value="longer">Longer (more context)</SelectItem>
              <SelectItem value="warmer">Warmer & friendlier</SelectItem>
              <SelectItem value="more_direct">More direct</SelectItem>
              <SelectItem value="clearer">Clearer & simpler</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Rough direction for how the AI should shape the copy.
          </p>
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium">Tone</label>
          <Select
            value={config.tone}
            onValueChange={(val) =>
              form.setValue("config.tone", val as RewritePresetConfig["tone"])
            }
          >
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="neutral">Neutral</SelectItem>
              <SelectItem value="friendly">Friendly</SelectItem>
              <SelectItem value="casual">Casual</SelectItem>
              <SelectItem value="formal">Formal</SelectItem>
              <SelectItem value="assertive">Assertive</SelectItem>
              <SelectItem value="playful">Playful</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Overall voice of the rewritten email.
          </p>
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium">Max words (optional)</label>
          <Input
            type="number"
            min={1}
            max={1000}
            value={config.max_words ?? ""}
            onChange={(e) => {
              const val = e.target.value;
              form.setValue("config.max_words", val ? Number(val) : undefined);
            }}
            placeholder="e.g. 120"
            className="h-8"
          />
          <p className="text-xs text-muted-foreground">
            Leave blank if you don't want a hard target.
          </p>
        </div>
      </div>

      <div className="space-y-1">
        <label className="block text-sm font-medium">AI instructions</label>
        <Textarea
          rows={4}
          {...form.register("config.instructions")}
          placeholder='e.g. "Make it warmer and more conversational, but still focused on ROI and next steps."'
        />
        <p className="text-xs text-muted-foreground">
          Be explicit about what you want. The AI will follow this closely.
        </p>
      </div>

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={saving}
          >
            Cancel
          </Button>
        )}
        <Button type="submit" size="sm" disabled={saving}>
          {saving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
          {initial?.id ? "Save changes" : "Create preset"}
        </Button>
      </div>
    </form>
  );
}













