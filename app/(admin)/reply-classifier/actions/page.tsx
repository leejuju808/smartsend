"use client";

import { useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

type ActionRow = {
  id: string;
  created_at: string;
  campaign_id: string | null;
  label_key: string;
  action: string;
  params: Record<string, unknown> | null;
};

const LABEL_OPTIONS = [
  "action_required",
  "question",
  "positive",
  "neutral",
  "not_interested",
  "routing",
  "ooo",
  "bounce",
];

const ACTION_OPTIONS = [
  "pause_followups",
  "create_task",
  "route_owner",
  "schedule_followup",
  "suppress",
  "noop",
  "set_ooo",
];

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function LabelActionsPage() {
  const { data, isLoading, mutate } = useSWR<ActionRow[]>(
    "/api/admin/reply-classifier/label-actions",
    fetcher
  );

  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({
    campaign_id: "",
    label_key: "action_required",
    action: "create_task",
    params: '{"title":"Reply needed","priority":"high"}',
  });

  const rows = data ?? [];

  async function updateRow(id: string, patch: Partial<ActionRow>) {
    const res = await fetch("/api/admin/reply-classifier/label-actions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, patch }),
    });

    if (!res.ok) {
      const text = await res.text();
      toast.error(`Update failed: ${text}`);
      return;
    }

    toast.success("Updated");
    await mutate();
  }

  async function deleteRow(id: string) {
    const res = await fetch("/api/admin/reply-classifier/label-actions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });

    if (!res.ok) {
      const text = await res.text();
      toast.error(`Delete failed: ${text}`);
      return;
    }

    toast.success("Deleted");
    await mutate();
  }

  async function createRow() {
    let paramsJson: Record<string, unknown> | null = null;
    if (draft.params.trim()) {
      try {
        paramsJson = JSON.parse(draft.params);
      } catch (error) {
        toast.error("Params must be valid JSON");
        return;
      }
    }

    setCreating(true);
    const res = await fetch("/api/admin/reply-classifier/label-actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label_key: draft.label_key,
        action: draft.action,
        campaign_id: draft.campaign_id || null,
        params: paramsJson,
      }),
    });
    setCreating(false);

    if (!res.ok) {
      const text = await res.text();
      toast.error(`Create failed: ${text}`);
      return;
    }

    toast.success("Created");
    await mutate();
    setDraft({
      campaign_id: "",
      label_key: "action_required",
      action: "create_task",
      params: '{"title":"Reply needed","priority":"high"}',
    });
  }

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading label actions…</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Label Actions</h1>
          <p className="text-sm text-muted-foreground">
            Configure automation taken when labels are detected. Campaign-specific overrides run before global defaults.
          </p>
        </div>
        <Badge variant="secondary">{rows.length} entries</Badge>
      </div>

      <div className="rounded-xl border p-4">
        <h2 className="text-sm font-medium">Add action</h2>
        <div className="mt-3 grid gap-3 lg:grid-cols-[1fr,1fr,1fr]">
          <div className="space-y-1">
            <label className="text-xs uppercase text-muted-foreground">Scope</label>
            <Input
              placeholder="Campaign ID (blank for global)"
              value={draft.campaign_id}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, campaign_id: event.target.value }))
              }
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs uppercase text-muted-foreground">Label</label>
            <Select
              value={draft.label_key}
              onValueChange={(value) => setDraft((prev) => ({ ...prev, label_key: value }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LABEL_OPTIONS.map((label) => (
                  <SelectItem key={label} value={label}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs uppercase text-muted-foreground">Action</label>
            <Select
              value={draft.action}
              onValueChange={(value) => setDraft((prev) => ({ ...prev, action: value }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACTION_OPTIONS.map((action) => (
                  <SelectItem key={action} value={action}>
                    {action}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Textarea
          className="mt-3 font-mono text-xs"
          rows={4}
          placeholder='Action params JSON (e.g. {"priority":"high"})'
          value={draft.params}
          onChange={(event) =>
            setDraft((prev) => ({
              ...prev,
              params: event.target.value,
            }))
          }
        />
        <Button className="mt-3" onClick={createRow} disabled={creating}>
          {creating ? "Saving…" : "Create"}
        </Button>
      </div>

      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.id} className="space-y-3 rounded-xl border p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Badge variant={row.campaign_id ? "default" : "outline"}>
                {row.campaign_id ? "Campaign override" : "Global default"}
              </Badge>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Created {new Date(row.created_at).toLocaleString()}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-red-600 hover:text-red-700"
                  onClick={() => deleteRow(row.id)}
                >
                  Delete
                </Button>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-[1fr,1fr,1fr]">
              <Input
                defaultValue={row.campaign_id ?? ""}
                placeholder="Campaign ID (blank for global)"
                onBlur={(event) =>
                  updateRow(row.id, {
                    campaign_id:
                      event.target.value.trim() === "" ? null : event.target.value.trim(),
                  })
                }
              />
              <Select
                value={row.label_key}
                onValueChange={(value) => updateRow(row.id, { label_key: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LABEL_OPTIONS.map((label) => (
                    <SelectItem key={label} value={label}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={row.action}
                onValueChange={(value) => updateRow(row.id, { action: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTION_OPTIONS.map((action) => (
                    <SelectItem key={action} value={action}>
                      {action}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Textarea
              key={row.id}
              defaultValue={JSON.stringify(row.params ?? {}, null, 2)}
              className="font-mono text-xs"
              rows={6}
              placeholder='Params JSON (leave blank for {{}})'
              onBlur={(event) => {
                const value = event.target.value.trim();
                if (!value) {
                  void updateRow(row.id, { params: null });
                  return;
                }
                try {
                  const parsed = JSON.parse(value);
                  void updateRow(row.id, { params: parsed });
                } catch (error) {
                  toast.error("Invalid JSON");
                }
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

