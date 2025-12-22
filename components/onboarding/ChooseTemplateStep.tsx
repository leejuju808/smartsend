// Block 21675 — Choose Template Step Component
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type Template = {
  id: string;
  name: string;
  description: string;
  goal: string;
};

export default function ChooseTemplateStep() {
  const router = useRouter();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    async function loadTemplates() {
      try {
        const res = await fetch("/api/onboarding/templates");
        if (res.ok) {
          const data = await res.json();
          setTemplates(data.templates || []);
        }
      } catch (error) {
        console.error("Error loading templates:", error);
      } finally {
        setIsLoading(false);
      }
    }
    loadTemplates();
  }, []);

  async function chooseTemplate(templateId: string) {
    setIsSaving(true);
    try {
      const res = await fetch("/api/onboarding/template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template_id: templateId }),
      });

      if (!res.ok) {
        throw new Error("Failed to select template");
      }

      // Update onboarding step
      await fetch("/api/onboarding/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_step: "ai-personalize" }),
      });

      router.push("/onboarding/ai-personalize");
    } catch (error) {
      console.error("Error selecting template:", error);
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="bg-white p-8 rounded-xl shadow-sm border">
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-sm text-gray-600">Loading templates...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white p-8 rounded-xl shadow-sm border space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">
          Choose a Roofing Template
        </h1>
        <p className="text-sm text-gray-600">
          Select a pre-built template optimized for roofing campaigns.
        </p>
      </div>

      <div className="space-y-3">
        {templates.map((template) => (
          <div
            key={template.id}
            className={`p-4 border-2 rounded-lg cursor-pointer transition-colors ${
              selectedTemplate === template.id
                ? "border-blue-600 bg-blue-50"
                : "border-gray-200 hover:border-gray-300"
            }`}
            onClick={() => setSelectedTemplate(template.id)}
          >
            <h3 className="font-semibold text-gray-900 mb-1">
              {template.name}
            </h3>
            <p className="text-sm text-gray-600">{template.description}</p>
            <span className="inline-block mt-2 text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded">
              {template.goal}
            </span>
          </div>
        ))}
      </div>

      <button
        disabled={!selectedTemplate || isSaving}
        onClick={() => selectedTemplate && chooseTemplate(selectedTemplate)}
        className="w-full px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed font-medium"
      >
        {isSaving ? "Saving..." : "Continue"}
      </button>
    </div>
  );
}














































