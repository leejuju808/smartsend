// Block 11000 — Step 1: Company Basics
// Screen: "Let's set up your roofing profile"

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const SERVICE_OPTIONS = [
  { id: "repairs", label: "Repairs", default: true },
  { id: "replacements", label: "Full Roof Replacements", default: false },
  { id: "inspections", label: "Inspections", default: true },
  { id: "emergency", label: "Emergency / Storm Damage", default: false },
];

export default function Step1CompanyPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    companyName: "",
    ownerName: "",
    city: "",
    state: "",
    serviceFocus: ["repairs", "inspections"], // Default pre-checked
  });

  const handleServiceToggle = (serviceId: string) => {
    setFormData((prev) => ({
      ...prev,
      serviceFocus: prev.serviceFocus.includes(serviceId)
        ? prev.serviceFocus.filter((id) => id !== serviceId)
        : [...prev.serviceFocus, serviceId],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/onboarding/step-1-company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: formData.companyName,
          ownerName: formData.ownerName,
          city: formData.city,
          state: formData.state,
          serviceFocus: formData.serviceFocus,
        }),
      });

      if (!res.ok) {
        const error = await res.json();
        alert(error.error || "Failed to save company profile");
        setLoading(false);
        return;
      }

      router.push("/onboarding/step-2-email");
    } catch (error: any) {
      console.error("Error:", error);
      alert("An error occurred. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="mb-8">
        <div className="text-xs text-gray-500 mb-2">Step 1 of 4</div>
        <h1 className="text-2xl font-semibold mb-2">
          Let&apos;s set up your roofing profile
        </h1>
        <p className="text-sm text-gray-600">
          Tell us about your company so SmartSend can personalize your emails.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium mb-2">
            Company Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            value={formData.companyName}
            onChange={(e) =>
              setFormData({ ...formData, companyName: e.target.value })
            }
            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
            placeholder="ABC Roofing"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            Owner/Contact Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            required
            value={formData.ownerName}
            onChange={(e) =>
              setFormData({ ...formData, ownerName: e.target.value })
            }
            className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
            placeholder="John Smith"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">
              City <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={formData.city}
              onChange={(e) =>
                setFormData({ ...formData, city: e.target.value })
              }
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
              placeholder="Tacoma"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">
              State <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              maxLength={2}
              value={formData.state}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  state: e.target.value.toUpperCase(),
                })
              }
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-black focus:border-transparent"
              placeholder="WA"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">
            Service Focus <span className="text-gray-500 text-xs">(Select all that apply)</span>
          </label>
          <div className="space-y-2 mt-2">
            {SERVICE_OPTIONS.map((service) => (
              <label
                key={service.id}
                className="flex items-center space-x-2 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={formData.serviceFocus.includes(service.id)}
                  onChange={() => handleServiceToggle(service.id)}
                  className="w-4 h-4 text-black border-gray-300 rounded focus:ring-black"
                />
                <span className="text-sm">{service.label}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Repairs and Inspections are pre-selected (highest reply rate)
          </p>
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <button
            type="button"
            onClick={() => router.back()}
            className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50"
          >
            Back
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2 text-sm bg-black text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Saving..." : "Continue"}
          </button>
        </div>
      </form>
    </div>
  );
}























































