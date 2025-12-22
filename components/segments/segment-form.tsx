"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  SegmentConditionsEditor,
} from "./segment-conditions-editor";
import { SegmentPreviewPanel } from "./segment-preview-panel";
import { saveSegment } from "@/app/api/segments/save/actions";
import { toast } from "sonner";
import { segmentSchema, SegmentInput, SegmentCondition } from "@/lib/segments/schema";
import { SegmentDebugDrawer } from "./SegmentDebugDrawer";
import { SegmentHeader } from "./SegmentHeader";

type SegmentFormValues = SegmentInput;

interface SegmentFormProps {
  accountId: string;
  ownerId: string;
  defaultValues?: Partial<SegmentFormValues>;
  onSaved?: (segment: any) => void;
}

export function SegmentForm({
  accountId,
  ownerId,
  defaultValues,
  onSaved,
}: SegmentFormProps) {
  const form = useForm<SegmentFormValues>({
    resolver: zodResolver(segmentSchema),
    defaultValues: {
      id: defaultValues?.id,
      account_id: accountId,
      owner_id: ownerId,
      name: defaultValues?.name ?? "",
      description: defaultValues?.description ?? null,
      conditions: (defaultValues?.conditions as SegmentCondition[]) ?? [],
    },
  });

  const [saving, setSaving] = React.useState(false);

  async function onSubmit(values: SegmentFormValues) {
    setSaving(true);
    try {
      const payload: SegmentFormValues = {
        ...values,
        account_id: accountId,
        owner_id: ownerId,
      };
      const result = await saveSegment(payload);
      toast.success("Segment saved");
      if (onSaved) onSaved(result);
    } catch (err) {
      console.error(err);
      toast.error("Failed to save segment");
    } finally {
      setSaving(false);
    }
  }

  const conditions = form.watch("conditions");

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
      <SegmentHeader
        accountId={accountId}
        conditions={conditions as SegmentCondition[]}
        title="Segment Builder"
      />

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label className="block text-sm font-medium mb-1">Segment name</label>
          <Input
            {...form.register("name")}
            placeholder="e.g. ICP — US SaaS using HubSpot (50+ employees)"
          />
          <p className="text-xs text-muted-foreground">
            Give this segment a clear, outcome-based name so teammates know when to use it.
          </p>
        </div>
        <div className="space-y-2">
          <label className="block text-sm font-medium mb-1">Description</label>
          <Input
            {...form.register("description")}
            placeholder="Optional: add notes about who this segment is for."
          />
          <p className="text-xs text-muted-foreground">
            Example: &quot;US-based SaaS, using HubSpot, likely to book demo from speed-to-lead.&quot;
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[2fr,1.4fr]">
        <div className="space-y-3 rounded-xl border bg-card px-3 py-3">
          <SegmentConditionsEditor
            value={conditions as SegmentCondition[]}
            onChange={(next) => form.setValue("conditions", next)}
          />
        </div>

        <SegmentPreviewPanel
          accountId={accountId}
          conditions={(conditions as SegmentCondition[]) || []}
        />
      </div>

      <div className="flex justify-between items-center">
        {form.watch("id") && (
          <SegmentDebugDrawer segmentId={form.watch("id")!} />
        )}
        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save segment"}
        </Button>
      </div>
    </form>
  );
}
