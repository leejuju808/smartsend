'use client';

import * as React from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";

const SUGGESTED = [
  { var_name: "first_name", path: "first_name" },
  { var_name: "company", path: "company" },
  { var_name: "website", path: "meta->>website" },
  { var_name: "city", path: "city" },
  { var_name: "title", path: "title" },
];

type MappingRow = {
  id?: string;
  var_name: string;
  lead_path: string;
  fallback?: string | null;
};

export default function VarMapPage() {
  const { presetId } = useParams() as { presetId: string };
  const [rows, setRows] = React.useState<MappingRow[]>([]);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    load();
  }, [presetId]);

  async function load() {
    const res = await fetch(`/api/presets/${presetId}/vars`, { cache: "no-store" });
    const json = await res.json();
    setRows(json.mappings ?? []);
  }

  function addRow() {
    setRows((prev) => [...prev, { var_name: "", lead_path: "", fallback: "" }]);
  }

  async function removeRow(index: number) {
    const target = rows[index];
    if (target?.id) {
      await fetch(`/api/presets/${presetId}/vars?id=${target.id}`, { method: "DELETE" }).catch(() => {});
    }
    setRows((prev) => removeAt(prev, index));
  }

  async function save() {
    setSaving(true);
    await fetch(`/api/presets/${presetId}/vars`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: rows }),
    });
    await load();
    setSaving(false);
  }

  return (
    <div className="space-y-4 p-4">
      <div className="text-xl font-semibold">Variable Mappings</div>
      <div className="space-y-2 rounded-2xl border p-3">
        {rows.map((r, i) => (
          <div key={r.id ?? i} className="grid gap-2 md:grid-cols-5">
            <input
              className="rounded-md border p-2 text-sm"
              placeholder="var_name (e.g., first_name)"
              value={r.var_name}
              onChange={(e) => setRows(edit(rows, i, { var_name: e.target.value }))}
            />
            <input
              className="md:col-span-2 rounded-md border p-2 text-sm"
              placeholder="lead_path (first_name | meta->>website)"
              value={r.lead_path}
              onChange={(e) => setRows(edit(rows, i, { lead_path: e.target.value }))}
            />
            <input
              className="rounded-md border p-2 text-sm"
              placeholder="fallback (optional)"
              value={r.fallback ?? ""}
              onChange={(e) => setRows(edit(rows, i, { fallback: e.target.value }))}
            />
            <Button variant="outline" onClick={() => removeRow(i)}>
              Remove
            </Button>
          </div>
        ))}
        {!rows.length && (
          <>
            <div className="text-sm text-muted-foreground">No mappings yet. Try one of these:</div>
            <div className="flex flex-wrap gap-2">
              {SUGGESTED.map((s) => (
                <Button
                  key={s.var_name}
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setRows((prev) => [
                      ...prev,
                      { var_name: s.var_name, lead_path: s.path, fallback: "" },
                    ])
                  }
                >
                  + {s.var_name} ← {s.path}
                </Button>
              ))}
            </div>
          </>
        )}
        <div className="flex items-center justify-between pt-2">
          <Button variant="outline" onClick={addRow}>
            + Add mapping
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function edit(arr: MappingRow[], i: number, patch: Partial<MappingRow>) {
  const next = [...arr];
  next[i] = { ...next[i], ...patch };
  return next;
}

function removeAt(arr: MappingRow[], i: number) {
  const next = [...arr];
  next.splice(i, 1);
  return next;
}

