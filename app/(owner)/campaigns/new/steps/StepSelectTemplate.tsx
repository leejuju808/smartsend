"use client";

import { useEffect, useState } from "react";

export default function StepSelectTemplate({
  template,
  setTemplate,
  next,
}: {
  template: any;
  setTemplate: (template: any) => void;
  next: () => void;
}) {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/campaign-templates");
        const data = await res.json();
        setTemplates(data.templates || []);
      } catch (error) {
        console.error("Failed to load templates:", error);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Choose a Campaign Template</h1>
        <p className="text-sm text-gray-600 mt-1">
          These campaigns are built specifically for roofing outreach and tuned
          for booking estimate calls.
        </p>
      </div>

      {loading ? (
        <div className="text-sm text-gray-500">Loading templates...</div>
      ) : (
        <div className="space-y-3">
          {templates.length === 0 ? (
            <div className="text-sm text-gray-500">
              No templates available. Please contact support.
            </div>
          ) : (
            templates.map((t) => (
              <button
                key={t.id}
                onClick={() => setTemplate(t)}
                className={`w-full text-left p-4 border rounded-md transition-colors ${
                  template?.id === t.id
                    ? "bg-blue-50 border-blue-400"
                    : "bg-white hover:bg-gray-50"
                }`}
              >
                <div className="font-medium">{t.name}</div>
                <div className="text-sm text-gray-600 mt-1">
                  {t.description || t.goal}
                </div>
              </button>
            ))
          )}
        </div>
      )}

      <div className="flex justify-end pt-4">
        <button
          disabled={!template}
          onClick={next}
          className="px-4 py-2 bg-blue-600 text-white rounded-md disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-700"
        >
          Continue
        </button>
      </div>
    </div>
  );
}



















