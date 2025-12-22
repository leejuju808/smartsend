"use client";

import * as React from "react";
import useSWR from "swr";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const schema = z.object({
  enabled: z.boolean().default(false),
  labels: z.array(z.enum(["question", "neutral"])).default(["question", "neutral"]),
  hours_wait: z.coerce.number().int().min(1).max(336).default(48),
  max_nudges: z.coerce.number().int().min(1).max(5).default(2),
  tone: z.enum(["warm", "concise", "professional"]).default("warm"),
  auto_send: z.boolean().default(false),
  subject_template: z.string().min(1).max(200).default("Quick follow-up"),
  body_html_template: z
    .string()
    .min(1)
    .max(8000)
    .default("<p>Just circling back—happy to keep this simple. Would a quick chat help?</p>"),
});

type FormValues = z.infer<typeof schema>;

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function SmartFollowupsPanel({ campaignId }: { campaignId: string }) {
  const { data, isLoading, mutate } = useSWR(
    `/api/campaigns/${campaignId}/followup-rules`,
    fetcher
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      enabled: false,
      labels: ["question", "neutral"],
      hours_wait: 48,
      max_nudges: 2,
      tone: "warm",
      auto_send: false,
      subject_template: "Quick follow-up",
      body_html_template: "<p>Just circling back—happy to keep this simple. Would a quick chat help?</p>",
    },
    values:
      isLoading || !data
        ? undefined
        : {
            enabled: data.enabled ?? false,
            labels: data.labels ?? ["question", "neutral"],
            hours_wait: data.hours_wait ?? 48,
            max_nudges: data.max_nudges ?? 2,
            tone: (data.tone ?? "warm") as FormValues["tone"],
            auto_send: data.auto_send ?? false,
            subject_template: data.subject_template ?? "Quick follow-up",
            body_html_template:
              data.body_html_template ??
              "<p>Just circling back—happy to keep this simple. Would a quick chat help?</p>",
          },
  });

  async function onSubmit(values: FormValues) {
    const res = await fetch(`/api/campaigns/${campaignId}/followup-rules`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(values),
    });

    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      toast.error(`Save failed: ${json?.error ?? res.statusText}`);
      return;
    }

    toast.success("Smart Follow-Ups saved");
    mutate();
  }

  const labels = form.watch("labels");
  const [running, setRunning] = React.useState(false);

  async function runFollowupsNow() {
    setRunning(true);
    try {
      const res = await fetch(
        `/functions/v1/followup-worker?campaign_id=${campaignId}`,
        {
          method: "POST",
          headers: {
            ...(process.env.NEXT_PUBLIC_CRON_SECRET
              ? { "x-cron-secret": process.env.NEXT_PUBLIC_CRON_SECRET }
              : {}),
          },
        }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error ?? res.statusText ?? "Failed to run follow-up worker");
      }
      toast.success(`Triggered follow-up worker (processed ${json?.processed ?? 0})`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(message);
    } finally {
      setRunning(false);
    }
  }

  const toggleLabel = (value: "question" | "neutral") => {
    const next = labels.includes(value)
      ? labels.filter((label) => label !== value)
      : [...labels, value];

    form.setValue("labels", next as FormValues["labels"], { shouldDirty: true });
  };

  return (
    <Card className="border border-zinc-800 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg">Smart Follow-Ups</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm">Enable Smart Follow-Ups</Label>
            <p className="text-xs text-muted-foreground">
              Automatically draft (or send) polite nudges when a lead replies with a question/neutral tone and no human responds.
            </p>
          </div>
          <Switch
            checked={form.watch("enabled")}
            onCheckedChange={(value) =>
              form.setValue("enabled", value, { shouldDirty: true })
            }
          />
        </div>

        <Separator />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-sm">Labels to watch</Label>
            <div className="flex gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={labels.includes("question")}
                  onChange={() => toggleLabel("question")}
                />
                question
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={labels.includes("neutral")}
                  onChange={() => toggleLabel("neutral")}
                />
                neutral
              </label>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm">Tone</Label>
            <Select
              value={form.watch("tone")}
              onValueChange={(value: FormValues["tone"]) =>
                form.setValue("tone", value, { shouldDirty: true })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select tone" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="warm">warm</SelectItem>
                <SelectItem value="concise">concise</SelectItem>
                <SelectItem value="professional">professional</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-sm">Wait (hours)</Label>
            <Input
              type="number"
              min={1}
              max={336}
              {...form.register("hours_wait", { valueAsNumber: true })}
            />
          </div>

          <div className="space-y-2">
            <Label className="text-sm">Max nudges</Label>
            <Input
              type="number"
              min={1}
              max={5}
              {...form.register("max_nudges", { valueAsNumber: true })}
            />
          </div>

          <div className="col-span-1 flex items-center justify-between md:col-span-2">
            <div>
              <Label className="text-sm">Auto-send</Label>
              <p className="text-xs text-muted-foreground">
                If off: create drafts and mark thread as needs reply. If on: send automatically with slight jitter.
              </p>
            </div>
            <Switch
              checked={form.watch("auto_send")}
              onCheckedChange={(value) =>
                form.setValue("auto_send", value, { shouldDirty: true })
              }
            />
          </div>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm">Subject template</Label>
            <Input
              {...form.register("subject_template")}
              placeholder="Quick follow-up"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-sm">Body template (HTML)</Label>
            <Textarea
              rows={6}
              {...form.register("body_html_template")}
              placeholder="<p>Just circling back—happy to keep this simple. Would a quick chat help?</p>"
            />
            <p className="text-xs text-muted-foreground">
              Supports basic HTML. We recommend short paragraphs and a single call-to-action.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={runFollowupsNow}
            disabled={running}
          >
            {running ? "Running…" : "Run follow-up now"}
          </Button>
          <Button
            onClick={form.handleSubmit(onSubmit)}
            disabled={isLoading || form.formState.isSubmitting}
          >
            Save
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}


