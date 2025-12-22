// Block 20280 — Lead Tag Settings Page

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

type TagRow = {
  id: string;
  label: string;
  color?: string | null;
  category?: string | null;
};

export default function LeadTagSettingsPage() {
  const router = useRouter();
  const [tags, setTags] = useState<TagRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [label, setLabel] = useState("");
  const [color, setColor] = useState("");
  const [category, setCategory] = useState("service_type");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/lead-tags");
      if (!res.ok) {
        throw new Error("Failed to load tags");
      }
      const json = await res.json();
      setTags(json.tags ?? []);
    } catch (error) {
      console.error("Error loading tags:", error);
    } finally {
      setLoading(false);
    }
  }

  async function createTag() {
    if (!label.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/lead-tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: label.trim(),
          color: color || null,
          category: category || null,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to create tag");
      }

      const json = await res.json();
      if (json.tag) {
        setTags((prev) => [...prev, json.tag]);
        setLabel("");
        setColor("");
        setCategory("service_type");
      }
    } catch (error: any) {
      console.error("Error creating tag:", error);
      alert(`Error: ${error.message}`);
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.back()}
            className="h-8 w-8 p-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-2xl font-semibold">Lead tags</h1>
        </div>
      </div>

      <p className="text-sm text-gray-500">
        Create tags to classify your leads by work type, damage type, and
        priority. These appear in the inbox sidebar.
      </p>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-800">New tag</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Label</label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  createTag();
                }
              }}
              className="w-full border rounded-lg px-2 py-1"
              placeholder="Full replacement"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full border rounded-lg px-2 py-1 bg-white"
            >
              <option value="service_type">Service type</option>
              <option value="damage_type">Damage type</option>
              <option value="priority">Priority</option>
              <option value="source">Source</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Color (optional)
            </label>
            <select
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="w-full border rounded-lg px-2 py-1 bg-white"
            >
              <option value="">Default</option>
              <option value="red">Red</option>
              <option value="amber">Amber</option>
              <option value="green">Green</option>
              <option value="blue">Blue</option>
              <option value="slate">Slate</option>
            </select>
          </div>
        </div>
        <div className="flex justify-end">
          <Button
            onClick={createTag}
            disabled={saving || !label.trim()}
            className="px-4 py-1.5 rounded-full bg-black text-white text-sm disabled:opacity-50"
          >
            {saving ? "Saving…" : "Add tag"}
          </Button>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-800">Existing tags</h2>
        {loading && <p className="text-xs text-gray-500">Loading tags…</p>}
        {!loading && tags.length === 0 && (
          <p className="text-xs text-gray-400">
            No tags yet. Create a few above like "Full replacement", "Repair
            only", "Hail damage", "Insurance claim".
          </p>
        )}
        <div className="flex flex-wrap gap-2 text-xs">
          {tags.map((t) => (
            <span
              key={t.id}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-gray-200 bg-gray-50"
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  t.color === "red"
                    ? "bg-red-500"
                    : t.color === "amber"
                    ? "bg-amber-500"
                    : t.color === "green"
                    ? "bg-emerald-500"
                    : t.color === "blue"
                    ? "bg-blue-500"
                    : "bg-slate-400"
                }`}
              />
              <span className="font-medium text-gray-800">{t.label}</span>
              {t.category && (
                <span className="text-[10px] text-gray-400">
                  ({t.category})
                </span>
              )}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}

















































