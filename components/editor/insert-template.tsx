"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Template = {
  id: string;
  name: string;
  category: string | null;
  body: string;
  shared: boolean;
  created_by: string;
  created_at: string;
};

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function InsertTemplate({
  onSelect,
}: {
  onSelect: (template: Template) => void;
}) {
  const { data, error } = useSWR<{ templates: Template[] }>(
    "/api/templates",
    fetcher
  );

  const templates = data?.templates || [];

  const handleValueChange = (id: string) => {
    const template = templates.find((t) => t.id === id);
    if (template) {
      onSelect(template);
    }
  };

  return (
    <Select onValueChange={handleValueChange}>
      <SelectTrigger className="w-52">
        <SelectValue placeholder="Insert Template…" />
      </SelectTrigger>
      <SelectContent>
        {templates.length === 0 && (
          <SelectItem value="__empty" disabled>
            {error ? "Failed to load templates" : "No templates available"}
          </SelectItem>
        )}
        {templates.map((t) => (
          <SelectItem key={t.id} value={t.id}>
            {t.name}
            {t.category && ` (${t.category})`}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}










