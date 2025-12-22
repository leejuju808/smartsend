"use client";

import { useEffect, useState } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Variant = {
  id: string;
  name: string;
  subject: string | null;
  body: string | null;
  weight: number;
  is_default: boolean;
  stats: {
    sent_count: number;
    open_rate: number;
    click_rate: number;
    reply_rate: number;
    meeting_rate: number;
  } | null;
};

export function StepVariantsPanel({ stepId }: { stepId: string }) {
  const [variants, setVariants] = useState<Variant[]>([]);
  const [loading, setLoading] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    subject: "",
    body: "",
    weight: 100,
  });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const res = await fetch(`/api/sequences/steps/${stepId}/variants`);
    const json = await res.json();
    setVariants(json.variants || []);
    setLoading(false);
  };

  useEffect(() => {
    if (stepId) load();
  }, [stepId]);

  const startCreate = () => {
    setEditingId(null);
    setForm({
      name: "Variant",
      subject: "",
      body: "",
      weight: 100,
    });
  };

  const startEdit = (v: Variant) => {
    setEditingId(v.id);
    setForm({
      name: v.name,
      subject: v.subject || "",
      body: v.body || "",
      weight: v.weight || 100,
    });
  };

  const save = async () => {
    setSaving(true);
    const payload = {
      name: form.name,
      subject: form.subject,
      body: form.body,
      weight: form.weight,
    };

    if (editingId) {
      await fetch(`/api/sequences/steps/variants/${editingId}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } else {
      await fetch(`/api/sequences/steps/${stepId}/variants/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }

    setSaving(false);
    setEditingId(null);
    await load();
  };

  const remove = async (id: string) => {
    await fetch(`/api/sequences/steps/variants/${id}/delete`, {
      method: "POST",
    });
    await load();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm">Variants (A/B testing)</CardTitle>
        <Button size="sm" variant="outline" onClick={startCreate}>
          + Add variant
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && (
          <p className="text-xs text-muted-foreground">Loading variants…</p>
        )}

        {!loading && variants.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No variants yet. Add one to start A/B testing this step.
          </p>
        )}

        {!loading &&
          variants.map((v) => (
            <div
              key={v.id}
              className="border rounded p-2 text-xs space-y-1 bg-muted/40"
            >
              <div className="flex justify-between items-center">
                <div className="font-semibold">
                  {v.name}{" "}
                  <span className="text-[11px] text-muted-foreground">
                    · Weight {v.weight}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button size="xs" variant="outline" onClick={() => startEdit(v)}>
                    Edit
                  </Button>
                  <Button size="xs" variant="outline" onClick={() => remove(v.id)}>
                    Delete
                  </Button>
                </div>
              </div>

              <div className="text-[11px] text-muted-foreground">
                {v.subject}
              </div>

              {v.stats && (
                <div className="flex flex-wrap gap-2 text-[11px] mt-1">
                  <span>Sends: {v.stats.sent_count}</span>
                  <span>Reply: {v.stats.reply_rate.toFixed(1)}%</span>
                  <span>Meeting: {v.stats.meeting_rate.toFixed(1)}%</span>
                </div>
              )}
            </div>
          ))}

        {/* Editor */}
        {(editingId || (!editingId && form.name)) && (
          <div className="border rounded p-3 space-y-2">
            <p className="text-xs font-semibold">
              {editingId ? "Edit variant" : "New variant"}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[11px] font-medium">Name</label>
                <Input
                  className="h-8 text-xs"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-medium">Weight</label>
                <Input
                  type="number"
                  min={1}
                  className="h-8 text-xs"
                  value={form.weight}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, weight: Number(e.target.value || 1) }))
                  }
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium">Subject</label>
              <Input
                className="h-8 text-xs"
                value={form.subject}
                onChange={(e) =>
                  setForm((f) => ({ ...f, subject: e.target.value }))
                }
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-medium">Body</label>
              <Textarea
                className="text-xs h-28"
                value={form.body}
                onChange={(e) =>
                  setForm((f) => ({ ...f, body: e.target.value }))
                }
              />
            </div>

            <div className="flex gap-2">
              <Button size="sm" onClick={save} disabled={saving}>
                {saving ? "Saving..." : editingId ? "Save changes" : "Create variant"}
              </Button>
              {editingId && (
                <Button size="sm" variant="outline" onClick={() => {
                  setEditingId(null);
                  setForm({ name: "", subject: "", body: "", weight: 100 });
                }}>
                  Cancel
                </Button>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}







