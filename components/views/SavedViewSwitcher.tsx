"use client";

import { useEffect, useState } from "react";

type SavedView = {
  id: string;
  name: string;
  description: string | null;
  scope: "personal" | "team" | "account" | "campaign";
  filters: Record<string, any>;
  sort: { field: string; dir: "asc" | "desc" };
  is_default: boolean;
  created_at: string;
  smart?: boolean;
};

interface SavedViewSwitcherProps {
  onSelect: (viewId: string) => void;
  className?: string;
}

export function SavedViewSwitcher({ onSelect, className }: SavedViewSwitcherProps) {
  const [views, setViews] = useState<SavedView[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res = await fetch("/api/saved-views/list");
        if (!res.ok) {
          console.error("Failed to load saved views");
          return;
        }
        const json = await res.json();
        if (mounted) {
          setViews(json.views || []);
        }
      } catch (err) {
        console.error("Error loading saved views:", err);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onSelect(e.target.value);
  };

  return (
    <select
      className={`border p-2 rounded text-sm ${className || ""}`}
      onChange={handleChange}
      disabled={loading}
    >
      <option value="">All Leads</option>
      {views.map((v) => (
        <option key={v.id} value={v.id}>
          {v.smart ? "🤖 " : v.scope === "team" ? "🌐 " : "👤 "}
          {v.name}
        </option>
      ))}
    </select>
  );
}

