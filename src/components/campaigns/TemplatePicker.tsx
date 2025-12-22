"use client";

import * as React from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type TemplateRow = { id: string; title?: string | null; subject?: string | null };

export function TemplatePicker({
  value,
  onChange,
  fetchUrl = "/api/smartsend/smartsend/templates",
}: {
  value?: string | null;
  onChange?: (templateId: string | null) => void;
  fetchUrl?: string;
}) {
  const [items, setItems] = React.useState<TemplateRow[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const r = await fetch(fetchUrl, { cache: "no-store" });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || "Failed to load templates");
        const arr = (j.templates || j.data?.items || []) as any[];
        setItems(
          arr.map((t) => ({
            id: t.id,
            title: t.title || t.name || "Untitled",
            subject: t.subject || t.subject_tpl || null,
          }))
        );
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [fetchUrl]);

  return (
    <Select
      value={value ?? undefined}
      onValueChange={(v) => onChange?.(v || null)}
      disabled={loading}
    >
      <SelectTrigger className="w-80">
        <SelectValue placeholder={loading ? "Loading templates…" : "Select a template"} />
      </SelectTrigger>
      <SelectContent>
        {items.map((t) => (
          <SelectItem key={t.id} value={t.id}>
            {t.title || t.subject || t.id}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}


