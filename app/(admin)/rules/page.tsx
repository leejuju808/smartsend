"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

type RuleScope = "global" | "campaign";
type RuleKind =
  | "subject_regex"
  | "text_regex"
  | "header_key"
  | "header_value_regex";

type RuleRow = {
  id: string;
  created_at: string;
  updated_at: string;
  scope: RuleScope;
  campaign_id: string | null;
  label: string;
  kind: RuleKind;
  pattern: string;
  weight: number;
  is_active: boolean;
};

export default function RulesPage() {
  const [rows, setRows] = useState<RuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/rules");
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const data = (await res.json()) as RuleRow[];
      setRows(data);
    } catch (error) {
      console.error("Failed to load rules", error);
      toast.error("Failed to load rules");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function save(row: RuleRow) {
    setSavingId(row.id);
    try {
      const res = await fetch("/api/rules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(row),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text);
      }
      const data = (await res.json()) as RuleRow;
      setRows((prev) =>
        prev.map((existing) => (existing.id === data.id ? data : existing)),
      );
      toast.success("Saved");
    } catch (error) {
      console.error("Failed to save rule", error);
      toast.error("Save failed");
      await load();
    } finally {
      setSavingId(null);
    }
  }

  const handleChange = (id: string, patch: Partial<RuleRow>) => {
    let updatedRow: RuleRow | null = null;
    setRows((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        updatedRow = { ...row, ...patch };
        return updatedRow;
      }),
    );
    if (updatedRow) {
      void save(updatedRow);
    }
  };

  async function compile() {
    try {
      const res = await fetch("/api/compile-rules", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Compile failed");
      }
      toast.success("Rules compiled");
    } catch (error) {
      console.error("Compile failed", error);
      toast.error(
        error instanceof Error ? error.message : "Compile failed",
      );
    }
  }

  if (loading) {
    return null;
  }

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Reply Rules</h1>
        <Button onClick={compile}>Compile &amp; Publish</Button>
      </div>
      <div className="space-y-3">
        {rows.map((r) => (
          <div
            key={r.id}
            className="grid grid-cols-7 items-center gap-2 rounded-xl border p-3"
          >
            <Select
              value={r.scope}
              onValueChange={(value) =>
                handleChange(r.id, { scope: value as RuleScope })
              }
            >
              <SelectTrigger className="col-span-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="global">global</SelectItem>
                <SelectItem value="campaign">campaign</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder="campaign_id"
              value={r.campaign_id ?? ""}
              onChange={(event) =>
                handleChange(r.id, {
                  campaign_id: event.target.value || null,
                })
              }
              className="col-span-2"
            />
            <Input
              placeholder="label"
              value={r.label}
              onChange={(event) =>
                handleChange(r.id, { label: event.target.value })
              }
            />
            <Select
              value={r.kind}
              onValueChange={(value) =>
                handleChange(r.id, { kind: value as RuleKind })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="subject_regex">subject_regex</SelectItem>
                <SelectItem value="text_regex">text_regex</SelectItem>
                <SelectItem value="header_key">header_key</SelectItem>
                <SelectItem value="header_value_regex">
                  header_value_regex
                </SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder="pattern"
              value={r.pattern}
              onChange={(event) =>
                handleChange(r.id, { pattern: event.target.value })
              }
              className="col-span-2"
            />
            <div className="flex items-center gap-2">
              <Input
                type="number"
                step="0.1"
                value={Number.isFinite(r.weight) ? r.weight : 0}
                onChange={(event) =>
                  handleChange(r.id, {
                    weight: Number.parseFloat(event.target.value) || 0,
                  })
                }
                className="w-20"
              />
              <div className="flex items-center gap-1">
                <Switch
                  checked={r.is_active}
                  onCheckedChange={(value) =>
                    handleChange(r.id, { is_active: value })
                  }
                  disabled={savingId === r.id}
                />
                <span className="text-xs">active</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


