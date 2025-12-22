"use client";

// Block 10800 — SmartSend Roofing Contact Loader v1
// ListSelector - Select a contact list for campaign targeting

import React from "react";
import { cn } from "@/lib/utils";

type List = {
  id: string;
  name: string;
  contact_count: number;
};

type Props = {
  campaignId: string;
  value: string | null;
  onChange?: (listId: string | null) => void;
  className?: string;
};

export function ListSelector({ campaignId, value, onChange, className }: Props) {
  const [lists, setLists] = React.useState<List[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    let ignore = false;
    const loadLists = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/lists");
        if (!res.ok) return;
        const json = await res.json();
        if (!ignore) {
          setLists(json.lists ?? []);
        }
      } catch (e) {
        console.error("Error loading lists:", e);
      } finally {
        setLoading(false);
      }
    };
    void loadLists();
    return () => {
      ignore = true;
    };
  }, []);

  const handleChange = async (next: string) => {
    const listId = next === "none" ? null : next;

    onChange?.(listId);

    setSaving(true);
    try {
      await fetch(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listId }),
      });
    } catch (e) {
      console.error("Error saving list selection:", e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={cn("space-y-1", className)}>
      <label className="block text-sm font-medium">Target List</label>
      <select
        className="w-full border rounded-md p-2 text-sm"
        value={value ?? "none"}
        onChange={(e) => handleChange(e.target.value)}
        disabled={loading || saving}
      >
        <option value="none">No List (use segment/SmartList)</option>
        {lists.map((list) => (
          <option key={list.id} value={list.id}>
            {list.name} ({list.contact_count} contacts)
          </option>
        ))}
      </select>
      {value && (
        <p className="text-xs text-muted-foreground mt-1">
          Campaign will target contacts from this list only.
        </p>
      )}
    </div>
  );
}























































