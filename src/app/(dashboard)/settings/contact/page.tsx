"use client";

import { useEffect, useState } from "react";

type ContactSettings = {
  company_name: string;
  default_city: string;
  booking_url: string;
  phone: string;
  email_signature: string;
};

export default function ContactSettingsPage() {
  const [form, setForm] = useState<ContactSettings>({
    company_name: "",
    default_city: "",
    booking_url: "",
    phone: "",
    email_signature: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch("/api/settings/contact", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          setForm((prev) => ({ ...prev, ...data }));
        }
      } catch (e) {
        console.error("Contact settings load error:", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function updateField<K extends keyof ContactSettings>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch("/api/settings/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setStatus("Saved.");
      setTimeout(() => setStatus(null), 2000);
    } catch (e: any) {
      console.error(e);
      setStatus(e.message ?? "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-neutral-400">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-xl font-semibold text-neutral-50">
          Contact & Booking Settings
        </h1>
        <p className="text-sm text-neutral-400">
          This information will be used in your email templates and booking
          footers so homeowners know exactly how to reach you.
        </p>
      </header>

      <div className="max-w-xl space-y-4 rounded-2xl border border-neutral-800 bg-neutral-950/80 p-5 text-xs text-neutral-100">
        {/* Company Name */}
        <div className="flex flex-col gap-1">
          <label className="text-neutral-300">Company name</label>
          <input
            value={form.company_name}
            onChange={(e) => updateField("company_name", e.target.value)}
            placeholder="Summit Roofing Co."
            className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2"
          />
        </div>

        {/* Default City */}
        <div className="flex flex-col gap-1">
          <label className="text-neutral-300">Primary city / area</label>
          <input
            value={form.default_city}
            onChange={(e) => updateField("default_city", e.target.value)}
            placeholder="Boise, ID"
            className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2"
          />
        </div>

        {/* Phone */}
        <div className="flex flex-col gap-1">
          <label className="text-neutral-300">Estimate phone number</label>
          <input
            value={form.phone}
            onChange={(e) => updateField("phone", e.target.value)}
            placeholder="(555) 123-4567"
            className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2"
          />
          <p className="text-[0.7rem] text-neutral-500">
            This is the number homeowners will see in your email footer.
          </p>
        </div>

        {/* Booking URL */}
        <div className="flex flex-col gap-1">
          <label className="text-neutral-300">Booking link (optional)</label>
          <input
            value={form.booking_url}
            onChange={(e) => updateField("booking_url", e.target.value)}
            placeholder="https://yourroofingwebsite.com/book"
            className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2"
          />
          <p className="text-[0.7rem] text-neutral-500">
            Calendly, your website booking page, or an online quote form.
          </p>
        </div>

        {/* Signature */}
        <div className="flex flex-col gap-1">
          <label className="text-neutral-300">Signature line (optional)</label>
          <textarea
            rows={2}
            value={form.email_signature}
            onChange={(e) => updateField("email_signature", e.target.value)}
            placeholder="Licensed & insured • Locally owned in Boise since 2008."
            className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2"
          />
        </div>

        {status && (
          <div className="rounded-xl border border-neutral-700 bg-neutral-900/60 p-3 text-xs text-neutral-200">
            {status}
          </div>
        )}

        <button
          disabled={saving}
          onClick={save}
          className="w-full rounded-xl bg-neutral-100 px-4 py-2 text-xs font-semibold text-neutral-900 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save Settings"}
        </button>
      </div>
    </div>
  );
}

























































