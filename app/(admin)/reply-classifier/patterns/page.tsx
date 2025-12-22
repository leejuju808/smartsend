"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

type PatternRow = {
  id: string;
  created_at: string;
  pattern: string;
  locale: string | null;
  priority: number;
  active: boolean;
  note: string | null;
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function OooPatternsPage() {
  const { data, isLoading, mutate } = useSWR<PatternRow[]>(
    "/api/admin/reply-classifier/ooo-patterns",
    fetcher
  );
  const [creating, setCreating] = useState(false);
  const [draftPattern, setDraftPattern] = useState({
    pattern: "",
    priority: 10,
    note: "",
  });
  const [testText, setTestText] = useState("");

  const rows = data ?? [];

  const matches = useMemo(() => {
    return rows.map((row) => {
      if (!testText) return false;
      try {
        return new RegExp(row.pattern, "i").test(testText);
      } catch (error) {
        console.warn("Invalid regex", error);
        return false;
      }
    });
  }, [rows, testText]);

  async function updateRow(id: string, patch: Partial<PatternRow>) {
    const res = await fetch("/api/admin/reply-classifier/ooo-patterns", {
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
    const res = await fetch("/api/admin/reply-classifier/ooo-patterns", {
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
    if (!draftPattern.pattern.trim()) {
      toast.error("Pattern required");
      return;
    }
    setCreating(true);
    const res = await fetch("/api/admin/reply-classifier/ooo-patterns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pattern: draftPattern.pattern,
        priority: Number.isFinite(draftPattern.priority) ? draftPattern.priority : 10,
        note: draftPattern.note || null,
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
    setDraftPattern({ pattern: "", priority: 10, note: "" });
  }

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading patterns…</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">OOO Pattern Library</h1>
          <p className="text-sm text-muted-foreground">
            Manage regex patterns used to detect out-of-office responses.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={testText}
            onChange={(event) => setTestText(event.target.value)}
            placeholder="Try text…"
            className="w-72"
          />
          <Badge variant={testText ? "default" : "secondary"}>
            {testText ? "Testing enabled" : "Enter sample text"}
          </Badge>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border p-4">
          <h2 className="text-sm font-medium">Add pattern</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <Input
              placeholder="Regex pattern"
              value={draftPattern.pattern}
              onChange={(event) =>
                setDraftPattern((prev) => ({ ...prev, pattern: event.target.value }))
              }
              className="md:col-span-2"
            />
            <Input
              type="number"
              min={0}
              value={draftPattern.priority}
              onChange={(event) =>
                setDraftPattern((prev) => ({
                  ...prev,
                  priority: Number.parseInt(event.target.value, 10) || 10,
                }))
              }
            />
            <Input
              placeholder="Note"
              value={draftPattern.note}
              onChange={(event) =>
                setDraftPattern((prev) => ({ ...prev, note: event.target.value }))
              }
            />
          </div>
          <Button className="mt-3" onClick={createRow} disabled={creating}>
            {creating ? "Saving…" : "Create"}
          </Button>
        </div>

        <div className="space-y-3">
          {rows.map((row, idx) => {
            const match = matches[idx];
            return (
              <div
                key={row.id}
                className="rounded-xl border p-4 shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={row.active}
                      onCheckedChange={(value) => updateRow(row.id, { active: value })}
                    />
                    <span className="text-xs uppercase text-muted-foreground">
                      {row.locale ?? "en"}
                    </span>
                  </div>
                  <Badge variant={match ? "default" : "outline"}>
                    {match ? "Matches sample" : "No match"}
                  </Badge>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-[2fr,120px]">
                  <Input
                    value={row.pattern}
                    onChange={(event) => updateRow(row.id, { pattern: event.target.value })}
                  />
                  <Input
                    type="number"
                    value={row.priority}
                    onChange={(event) =>
                      updateRow(row.id, {
                        priority: Number.parseInt(event.target.value, 10) || 0,
                      })
                    }
                  />
                </div>
                <Textarea
                  className="mt-3"
                  placeholder="Internal note"
                  value={row.note ?? ""}
                  onChange={(event) => updateRow(row.id, { note: event.target.value })}
                />
                <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Added {new Date(row.created_at).toLocaleString()}</span>
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
            );
          })}
        </div>
      </div>
    </div>
  );
}

