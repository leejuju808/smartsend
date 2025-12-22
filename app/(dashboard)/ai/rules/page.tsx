'use client';

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

type Rule = {
  id: string;
  name: string;
  priority: number;
  kind: string;
  pattern: string;
  force_label: string;
  enabled: boolean;
  notes?: string | null;
};

const DEFAULT_FORM: Omit<Rule, "id"> & { scope?: string } = {
  name: "",
  priority: 100,
  kind: "regex",
  pattern: "",
  force_label: "neutral",
  enabled: true,
  notes: "",
  scope: "replies-cls",
};

export default function RulesPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const r = await fetch("/api/ai/rules/list");
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error ?? "Failed to fetch rules");
      setRules(j.data ?? []);
    } catch (err) {
      console.error("load rules failed", err);
      toast.error(err instanceof Error ? err.message : "Failed to load rules");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const add = async () => {
    try {
      setCreating(true);
      const r = await fetch("/api/ai/rules/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error ?? "Failed to add rule");
      toast.success("Rule added");
      setForm(DEFAULT_FORM);
      load();
    } catch (err) {
      console.error("add rule failed", err);
      toast.error(err instanceof Error ? err.message : "Failed to add rule");
    } finally {
      setCreating(false);
    }
  };

  const toggle = async (id: string, enabled: boolean) => {
    try {
      const r = await fetch("/api/ai/rules/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, enabled }),
      });
      const j = await r.json();
      if (!r.ok || !j?.ok) throw new Error(j?.error ?? "Toggle failed");
      load();
    } catch (err) {
      console.error("toggle rule failed", err);
      toast.error(err instanceof Error ? err.message : "Failed to toggle rule");
    }
  };

  return (
    <div className="p-6 grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Add Rule</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-2 lg:grid-cols-6">
          <Input
            placeholder="name"
            value={form.name}
            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
          />
          <Input
            type="number"
            placeholder="priority"
            value={form.priority}
            onChange={(e) => setForm((prev) => ({ ...prev, priority: Number(e.target.value) }))}
          />
          <Input
            placeholder="kind (regex|keyword|heuristic)"
            value={form.kind}
            onChange={(e) => setForm((prev) => ({ ...prev, kind: e.target.value }))}
          />
          <Input
            placeholder="pattern"
            value={form.pattern}
            onChange={(e) => setForm((prev) => ({ ...prev, pattern: e.target.value }))}
          />
          <Input
            placeholder="force_label"
            value={form.force_label}
            onChange={(e) => setForm((prev) => ({ ...prev, force_label: e.target.value }))}
          />
          <Button onClick={add} disabled={creating}>
            {creating ? "Adding…" : "Add"}
          </Button>
          <Textarea
            className="md:col-span-2 lg:col-span-6"
            placeholder="notes (optional)"
            rows={2}
            value={form.notes ?? ""}
            onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rules</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          {loading ? <div className="text-sm text-muted-foreground">Loading…</div> : null}
          {!loading && rules.length === 0 ? (
            <div className="text-sm text-muted-foreground">No rules yet.</div>
          ) : null}
          {rules.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-xl border p-3">
              <div>
                <div className="font-medium">
                  {r.priority}. {r.name}
                </div>
                <div className="text-xs text-muted-foreground">
                  {r.kind} — {r.pattern}
                </div>
                {r.notes ? (
                  <div className="mt-1 text-xs text-muted-foreground">{r.notes}</div>
                ) : null}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs uppercase text-muted-foreground">{r.force_label}</span>
                <Switch checked={r.enabled} onCheckedChange={(v) => toggle(r.id, v)} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
















