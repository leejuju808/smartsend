"use client";

import { useCampaignTemplates } from "@/hooks/useCampaignTemplates";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import RoofingTemplatePicker from "@/components/campaigns/RoofingTemplatePicker";

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

export default function NewCampaignPage() {
  const { templates, loading } = useCampaignTemplates();
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromOnboarding = searchParams.get("from") === "onboarding";
  const [creatingId, setCreatingId] = useState<string | null>(null);
  const [showRoofingTemplates, setShowRoofingTemplates] = useState(false);
  const [creatingRoofingId, setCreatingRoofingId] = useState<string | null>(null);

  async function useTemplate(id: string) {
    // Prefer the slug-driven builder flow (supports locked-copy templates).
    const selected = templates.find((t: any) => t.id === id);
    if (selected?.slug) {
      router.push(`/campaigns/new/from-template/${selected.slug}`);
      return;
    }

    // Fallback: old clone endpoint
    setCreatingId(id);
    const res = await fetch(`/api/campaign-templates/${id}/clone`, {
      method: "POST",
    });
    const data = await res.json();
    setCreatingId(null);
    if (!res.ok) {
      alert(data.error || "Failed to create campaign");
      return;
    }
    router.push(`/campaigns/${data.campaign_id}/review`);
  }

  async function useRoofingTemplate(template: RoofingTemplate) {
    setCreatingRoofingId(template.id);
    const res = await fetch(`/api/templates/roofing/${template.id}/instantiate`, {
      method: "POST",
    });
    const data = await res.json();
    setCreatingRoofingId(null);
    if (!res.ok) {
      alert(data.error || "Failed to create campaign");
      return;
    }
    router.push(data.next || `/campaigns/${data.campaign_id}/review`);
  }

  function buildFromScratch() {
    router.push("/campaigns/new/custom");
  }

  return (
    <div className="max-w-4xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold">New Campaign</h1>
        <p className="text-xs text-gray-600 mt-1">
          Start with a proven roofing playbook or build your own sequence.
        </p>
      </div>

      {/* Roofing Template Section (disabled for v1 single-template flow) */}
      {false && (
        <div className="border rounded-2xl p-4 bg-gradient-to-br from-blue-50 to-indigo-50">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold">Roofing Campaign Templates</h2>
              <p className="text-xs text-gray-600 mt-0.5">
                Done-for-you sequences that print replies. No writing. No thinking.
              </p>
            </div>
            <button
              onClick={() => setShowRoofingTemplates(!showRoofingTemplates)}
              className="text-xs px-3 py-1.5 rounded-xl border bg-white hover:bg-gray-50"
            >
              {showRoofingTemplates ? "Hide" : "Use Roofing Template"}
            </button>
          </div>
          {showRoofingTemplates && (
            <RoofingTemplatePicker
              onSelect={(template) => useRoofingTemplate(template)}
              creatingId={creatingRoofingId}
            />
          )}
        </div>
      )}

      {/* Existing Templates */}
      <div className="grid md:grid-cols-3 gap-3">
        {loading && <div>Loading templates…</div>}
        {!loading &&
          templates.map((tpl: any) => (
            <button
              key={tpl.id}
              onClick={() => useTemplate(tpl.id)}
              disabled={creatingId === tpl.id}
              className="border rounded-2xl p-3 bg-white text-left hover:bg-slate-50 disabled:opacity-40"
            >
              <div className="text-xs font-semibold">{tpl.name}</div>
              <div className="text-[11px] text-gray-600 mt-1 line-clamp-3">
                {tpl.description || tpl.audience_hint}
              </div>
              <div className="text-[10px] text-gray-400 mt-2 uppercase">
                {tpl.goal?.replace(/_/g, " ")}
              </div>
              {creatingId === tpl.id && (
                <div className="text-[10px] text-gray-500 mt-2">
                  Creating…
                </div>
              )}
            </button>
          ))}
      </div>

      <div className="border rounded-2xl p-3 bg-slate-50 flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold">Build from scratch</div>
          <div className="text-[11px] text-gray-600">
            Start with an empty sequence and customize every step.
          </div>
        </div>
        <button
          onClick={buildFromScratch}
          className="text-[11px] px-3 py-1.5 rounded-xl border"
        >
          Build manually
        </button>
      </div>
    </div>
  );
}
