"use client";

import { useEffect, useState } from "react";

type RoofingTemplate = {
  id: string;
  name: string;
  description: string | null;
  recommended_for: string;
  roofing_template_steps: Array<{
    step: number;
    subject: string;
    body: string;
    delayDays: number;
  }>;
};

export default function RoofingTemplatePicker({
  onSelect,
  creatingId,
}: {
  onSelect: (template: RoofingTemplate) => void;
  creatingId?: string | null;
}) {
  const [templates, setTemplates] = useState<RoofingTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/templates/roofing")
      .then((res) => res.json())
      .then((json) => {
        setTemplates(json.templates || []);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to load roofing templates:", err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="text-sm text-gray-500 py-4">Loading roofing templates…</div>
    );
  }

  if (templates.length === 0) {
    return (
      <div className="text-sm text-gray-500 py-4">
        No roofing templates available.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 mt-4">
      <h3 className="text-sm font-semibold">Choose a roofing template</h3>

      <div className="grid gap-4 sm:grid-cols-2">
        {templates.map((t) => (
          <button
            key={t.id}
            onClick={() => onSelect(t)}
            disabled={creatingId === t.id}
            className="rounded-xl border bg-card p-4 text-left text-xs shadow-sm hover:border-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <p className="text-sm font-semibold mb-1">{t.name}</p>
            <p className="mt-1 text-muted-foreground text-xs">
              {t.description}
            </p>
            <div className="mt-2 text-[10px] text-gray-400 uppercase">
              {t.recommended_for?.replace(/_/g, " ")}
            </div>
            <div className="mt-2 text-[10px] text-gray-500">
              {t.roofing_template_steps?.length || 0} email
              {t.roofing_template_steps?.length !== 1 ? "s" : ""}
            </div>
            {creatingId === t.id && (
              <div className="mt-2 text-[10px] text-gray-500">
                Creating…
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

