"use client";

// Block 20240 — Reply Templates Settings Page

import { useEffect, useState } from "react";

type TemplateRow = {
  id: string;
  name: string;
  category?: string | null;
  subject_template?: string | null;
  body_template: string;
};

export default function ReplyTemplatesSettingsPage() {
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/reply-templates");
      const json = await res.json();
      setTemplates(json.templates ?? []);
    } catch (err) {
      console.error("Failed to load templates", err);
    } finally {
      setLoading(false);
    }
  }

  async function createTemplate() {
    if (!name.trim() || !body.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/reply-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          category: category || null,
          subject_template: subject || null,
          body_template: body,
        }),
      });
      const json = await res.json();
      if (json.template) {
        setTemplates((prev) => [...prev, json.template]);
        setName("");
        setCategory("");
        setSubject("");
        setBody("");
      } else if (json.error) {
        alert(`Failed to create template: ${json.error}`);
      }
    } catch (err) {
      console.error("Failed to create template", err);
      alert("Failed to create template. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Reply templates</h1>
      <p className="text-sm text-gray-500">
        Create reusable replies for common situations (follow-ups, insurance
        questions, estimate sent, etc.). These appear in the inbox reply
        composer.
      </p>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-800">
          New template
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Template name
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border rounded-lg px-2 py-1"
              placeholder="Estimate follow-up (2 days)"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Category (optional)
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full border rounded-lg px-2 py-1 bg-white"
            >
              <option value="">None</option>
              <option value="followup">Follow-up</option>
              <option value="estimate">Estimate</option>
              <option value="insurance">Insurance</option>
              <option value="general">General</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Subject (optional)
            </label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full border rounded-lg px-2 py-1"
              placeholder="About your roof estimate"
            />
          </div>
          <div className="text-xs text-gray-500 flex items-end">
            You can use {`{{homeowner_name}}`} and {`{{company_name}}`} in
            subject and body.
          </div>
        </div>

        <div>
          <label className="block text-xs text-gray-500 mb-1">
            Body
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            className="w-full border rounded-lg px-3 py-2 text-sm"
            placeholder={`Hi {{homeowner_name}},\n\nThanks again for having us out. Here's what we recommend for your roof...\n\nBest,\n{{company_name}}`}
          />
        </div>

        <div className="flex justify-end">
          <button
            onClick={createTemplate}
            disabled={saving || !name.trim() || !body.trim()}
            className="px-4 py-1.5 rounded-full bg-black text-white text-sm disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save template"}
          </button>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-gray-800">
          Existing templates
        </h2>
        {loading && (
          <p className="text-xs text-gray-500">Loading templates…</p>
        )}
        {!loading && templates.length === 0 && (
          <p className="text-xs text-gray-400">
            No templates yet. Create your first one above.
          </p>
        )}
        <div className="space-y-2">
          {templates.map((t) => (
            <div
              key={t.id}
              className="border rounded-lg px-3 py-2 text-xs bg-gray-50"
            >
              <div className="flex items-center justify-between">
                <p className="font-semibold text-gray-800">{t.name}</p>
                {t.category && (
                  <span className="px-2 py-0.5 rounded-full border text-[10px] text-gray-600">
                    {t.category}
                  </span>
                )}
              </div>
              {t.subject_template && (
                <p className="text-[11px] text-gray-500 mt-1">
                  Subject: {t.subject_template}
                </p>
              )}
              <p className="text-[11px] text-gray-600 mt-1 line-clamp-3">
                {t.body_template}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

















































