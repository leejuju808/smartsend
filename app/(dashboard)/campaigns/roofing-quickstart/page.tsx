"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RoofingQuickstartPage() {
  const router = useRouter();

  const [service, setService] = useState("");
  const [city, setCity] = useState("");
  const [company, setCompany] = useState("");
  const [steps, setSteps] = useState("3");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function createCampaign() {
    setLoading(true);
    setStatus(null);

    const res = await fetch("/api/campaigns/quickstart/roofing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ service, city, company, steps }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus(data.error || "Failed to create campaign");
      setLoading(false);
      return;
    }

    router.push(`/campaigns/${data.id}`);
  }

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-xl font-semibold text-neutral-50">
          Roofing Quickstart Campaign
        </h1>
        <p className="text-sm text-neutral-400">
          Build a complete, personalized roofing outreach campaign in under 2
          minutes.
        </p>
      </header>

      <div className="max-w-lg space-y-6 rounded-2xl border border-neutral-800 bg-neutral-950/80 p-6 text-xs text-neutral-100">
        {/* Service */}
        <div className="flex flex-col gap-1">
          <label className="text-neutral-300">What type of work?</label>
          <select
            className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2"
            value={service}
            onChange={(e) => setService(e.target.value)}
          >
            <option value="">Select</option>
            <option value="roof replacement">Roof Replacement</option>
            <option value="roof repair">Roof Repair</option>
            <option value="storm damage">Storm Damage / Hail Damage</option>
            <option value="insurance claim">Insurance Claim Assistance</option>
            <option value="gutter upgrade">Gutter Upgrade / Add-On</option>
          </select>
        </div>

        {/* City */}
        <div className="flex flex-col gap-1">
          <label className="text-neutral-300">What city?</label>
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Boise, ID"
            className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2"
          />
        </div>

        {/* Company */}
        <div className="flex flex-col gap-1">
          <label className="text-neutral-300">Your company name</label>
          <input
            type="text"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Summit Roofing Co."
            className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2"
          />
        </div>

        {/* Steps */}
        <div className="flex flex-col gap-1">
          <label className="text-neutral-300">
            How many outreach steps?
          </label>
          <select
            value={steps}
            onChange={(e) => setSteps(e.target.value)}
            className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2"
          >
            <option value="3">3-Step (Standard)</option>
            <option value="5">5-Step (Aggressive / Storm)</option>
          </select>
        </div>

        {/* Status */}
        {status && (
          <div className="rounded-xl border border-neutral-700 bg-neutral-900/60 p-3 text-xs text-red-300">
            {status}
          </div>
        )}

        {/* Button */}
        <button
          disabled={loading || !service || !city || !company}
          onClick={createCampaign}
          className="w-full rounded-xl bg-neutral-100 px-4 py-2 text-xs font-semibold text-neutral-900 disabled:opacity-50"
        >
          {loading ? "Creating…" : "Create My Campaign"}
        </button>
      </div>
    </div>
  );
}

