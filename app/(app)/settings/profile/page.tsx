"use client";

import { useState, useEffect } from "react";
import { useWorkspaceProfile } from "@/hooks/useWorkspaceProfile";

const TONE_OPTIONS = [
  { key: "direct", label: "Direct & Straightforward" },
  { key: "friendly", label: "Friendly & Neighborly" },
  { key: "premium", label: "Premium / High-End" },
];

export default function WorkspaceProfilePage() {
  const { profile, loading, refresh } = useWorkspaceProfile();
  const [form, setForm] = useState({
    company_name: "",
    primary_city: "",
    service_area: "",
    typical_job_types: "",
    avg_job_value: "",
    tone_style: "direct",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && profile) {
      setForm({
        company_name: profile.company_name || "",
        primary_city: profile.primary_city || "",
        service_area: profile.service_area || "",
        typical_job_types: profile.typical_job_types || "",
        avg_job_value: profile.avg_job_value?.toString() || "",
        tone_style: profile.tone_style || "direct",
      });
    }
  }, [loading, profile]);

  async function handleSave() {
    setSaving(true);
    const res = await fetch("/api/workspace/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        avg_job_value: form.avg_job_value
          ? Number(form.avg_job_value)
          : null,
      }),
    });

    setSaving(false);

    if (!res.ok) {
      alert("Failed to save profile");
      return;
    }

    // Refresh the profile data
    refresh();
  }

  if (loading) {
    return <div>Loading profile…</div>;
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Company Profile</h1>
        <p className="text-xs text-gray-600 mt-1">
          This powers SmartSend&apos;s AI copy and local personalization for your roofing campaigns.
        </p>
      </div>

      <div className="space-y-3 border rounded-2xl p-4 bg-white">
        <Field
          label="Company name"
          value={form.company_name}
          onChange={(v) => setForm((f) => ({ ...f, company_name: v }))}
          placeholder="Example: Summit Roofing & Construction"
        />
        <Field
          label="Primary city"
          value={form.primary_city}
          onChange={(v) => setForm((f) => ({ ...f, primary_city: v }))}
          placeholder="Example: Tacoma, WA"
        />
        <Field
          label="Service area"
          value={form.service_area}
          onChange={(v) => setForm((f) => ({ ...f, service_area: v }))}
          placeholder="Example: Tacoma, Spanaway, Lakewood"
          hint="We use this for local references in your emails."
        />
        <Field
          label="Typical job types"
          value={form.typical_job_types}
          onChange={(v) => setForm((f) => ({ ...f, typical_job_types: v }))}
          placeholder="Ex: storm damage repair, full replacements, leak repair"
        />
        <Field
          label="Average job value (rough guess)"
          value={form.avg_job_value}
          onChange={(v) => setForm((f) => ({ ...f, avg_job_value: v }))}
          placeholder="Ex: 8500"
          prefix="$"
        />

        <div className="space-y-1">
          <div className="text-xs font-semibold">Tone style</div>
          <div className="flex gap-2 flex-wrap">
            {TONE_OPTIONS.map((t) => (
              <button
                key={t.key}
                onClick={() =>
                  setForm((f) => ({ ...f, tone_style: t.key }))
                }
                className={`px-3 py-1.5 rounded-xl border text-[11px] ${
                  form.tone_style === t.key
                    ? "bg-black text-white border-black"
                    : "bg-white text-gray-700 border-slate-200"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="px-4 py-2 rounded-xl bg-black text-white text-sm font-semibold disabled:opacity-40"
      >
        {saving ? "Saving…" : "Save Profile"}
      </button>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  hint,
  prefix,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  prefix?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-semibold">{label}</label>
      <div className="flex items-center gap-1">
        {prefix && (
          <span className="text-xs text-gray-500 pl-1">{prefix}</span>
        )}
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full border rounded-xl px-3 py-1.5 text-sm"
        />
      </div>
      {hint && <p className="text-[10px] text-gray-500">{hint}</p>}
    </div>
  );
}



























































