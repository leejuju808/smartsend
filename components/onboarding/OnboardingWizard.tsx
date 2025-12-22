"use client";

import { useState, useEffect } from "react";
import { useWorkspaceProfile } from "@/hooks/useWorkspaceProfile";
import { useRouter } from "next/navigation";

export function OnboardingWizard() {
  const { profile, loading, refresh } = useWorkspaceProfile();
  const router = useRouter();

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    company_name: "",
    primary_city: "",
    service_area: "",
    typical_job_types: "",
    avg_job_value: "",
    tone_style: "direct",
  });

  // Update form when profile loads
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

  if (loading) return null;

  async function handleFinish() {
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
      alert("Could not save profile");
      return;
    }

    // Refresh the profile data
    refresh();

    router.push("/campaigns/new");
  }

  return (
    <div className="max-w-xl border rounded-2xl p-4 bg-white space-y-4">
      <div>
        <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">
          Step {step} of 3
        </div>
        <h2 className="text-lg font-semibold">
          Let&apos;s set up SmartSend for your roofing company
        </h2>
      </div>

      {step === 1 && (
        <div className="space-y-3">
          <Field
            label="Company name"
            value={form.company_name}
            onChange={(v) => setForm((f) => ({ ...f, company_name: v }))}
            placeholder="Summit Roofing & Construction"
          />
          <Field
            label="Primary city"
            value={form.primary_city}
            onChange={(v) => setForm((f) => ({ ...f, primary_city: v }))}
            placeholder="Tacoma, WA"
          />
          <Field
            label="Service area"
            value={form.service_area}
            onChange={(v) => setForm((f) => ({ ...f, service_area: v }))}
            placeholder="Tacoma, Spanaway, Lakewood"
          />
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <Field
            label="What kind of jobs do you usually do?"
            value={form.typical_job_types}
            onChange={(v) =>
              setForm((f) => ({ ...f, typical_job_types: v }))
            }
            placeholder="Ex: storm damage, full roof replacements, leak repair"
          />
          <Field
            label="Average job value (rough guess)"
            value={form.avg_job_value}
            onChange={(v) =>
              setForm((f) => ({ ...f, avg_job_value: v }))
            }
            placeholder="Ex: 8500"
            prefix="$"
          />
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <div className="text-xs font-semibold">How should SmartSend sound?</div>
          <div className="text-[11px] text-gray-600 mb-1">
            We&apos;ll match the tone of your outreach to your brand.
          </div>
          <div className="flex gap-2 flex-wrap">
            {[
              { key: "direct", label: "Direct & Straightforward" },
              { key: "friendly", label: "Friendly & Neighborly" },
              { key: "premium", label: "Premium / High-End" },
            ].map((t) => (
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

          <div className="text-[11px] text-gray-500 mt-2">
            Next we&apos;ll help you create your first roofing campaign based on this info.
          </div>
        </div>
      )}

      <div className="flex justify-between items-center pt-2">
        {step > 1 ? (
          <button
            onClick={() => setStep((s) => s - 1)}
            className="text-[11px] text-gray-600"
          >
            ← Back
          </button>
        ) : (
          <span />
        )}

        {step < 3 ? (
          <button
            onClick={() => setStep((s) => s + 1)}
            className="px-4 py-1.5 rounded-xl bg-black text-white text-xs font-semibold"
          >
            Continue
          </button>
        ) : (
          <button
            onClick={handleFinish}
            disabled={saving}
            className="px-4 py-1.5 rounded-xl bg-black text-white text-xs font-semibold disabled:opacity-40"
          >
            {saving ? "Finishing…" : "Finish & Create Campaign"}
          </button>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  prefix,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  prefix?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="text-xs font-semibold">{label}</div>
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
    </div>
  );
}
