"use client";

import { useState, useEffect } from "react";

interface CampaignStep {
  id?: string;
  step_number: number;
  subject: string;
  body: string;
  delay_days: number;
}

type ProofSnippet = { id: string; title: string; text: string };

interface CampaignSequenceBuilderProps {
  campaignId: string | null;
  onSave?: () => void;
}

export default function CampaignSequenceBuilder({
  campaignId,
  onSave,
}: CampaignSequenceBuilderProps) {
  const [steps, setSteps] = useState<CampaignStep[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [proofSnippets, setProofSnippets] = useState<ProofSnippet[]>([]);
  const [proofSnippetId, setProofSnippetId] = useState<string>("");

  useEffect(() => {
    // Admin-only: try to load approved case study snippets (silently no-op if forbidden)
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/admin/case-studies/snippets", { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json().catch(() => ({}));
        const snippets = (json?.snippets || []) as ProofSnippet[];
        if (!alive) return;
        setProofSnippets(snippets);
        setProofSnippetId(snippets?.[0]?.id || "");
      } catch {
        // ignore
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Load existing steps when campaign changes
  useEffect(() => {
    if (campaignId) {
      loadSteps();
    } else {
      setSteps([]);
    }
  }, [campaignId]);

  const loadSteps = async () => {
    if (!campaignId) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/steps`);
      const data = await response.json();
      if (response.ok) {
        setSteps(data.steps || []);
      } else {
        setStatus(`Error loading steps: ${data.error}`);
      }
    } catch (error) {
      console.error("Failed to load steps:", error);
      setStatus("Failed to load steps");
    } finally {
      setLoading(false);
    }
  };

  const addStep = () => {
    const newStepNumber = steps.length + 1;
    setSteps([
      ...steps,
      {
        step_number: newStepNumber,
        subject: "",
        body: "",
        delay_days: newStepNumber === 1 ? 0 : 3,
      },
    ]);
  };

  const removeStep = (index: number) => {
    const newSteps = steps.filter((_, i) => i !== index);
    // Renumber steps
    const renumberedSteps = newSteps.map((step, i) => ({
      ...step,
      step_number: i + 1,
    }));
    setSteps(renumberedSteps);
  };

  const updateStep = (index: number, field: keyof CampaignStep, value: any) => {
    const newSteps = [...steps];
    newSteps[index] = { ...newSteps[index], [field]: value };
    setSteps(newSteps);
  };

  const insertProofSnippet = (index: number) => {
    const snip = proofSnippets.find((s) => s.id === proofSnippetId) || proofSnippets[0];
    if (!snip) return;
    const newSteps = [...steps];
    const prev = String(newSteps[index]?.body || "");
    const next = prev.trim().length ? `${prev}\n\n${snip.text}` : snip.text;
    newSteps[index] = { ...newSteps[index], body: next };
    setSteps(newSteps);
  };

  const saveSteps = async () => {
    if (!campaignId) {
      setStatus("Please select a campaign first");
      return;
    }

    if (steps.length === 0) {
      setStatus("Please add at least one step");
      return;
    }

    // Validate all steps
    for (const step of steps) {
      if (!step.subject || !step.body) {
        setStatus("Please fill in subject and body for all steps");
        return;
      }
    }

    setSaving(true);
    setStatus(null);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/steps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steps }),
      });

      const data = await response.json();
      if (response.ok) {
        setStatus(`✅ Saved ${steps.length} steps successfully!`);
        if (onSave) onSave();
      } else {
        setStatus(`Error: ${data.error || "Failed to save steps"}`);
      }
    } catch (error: any) {
      console.error("Failed to save steps:", error);
      setStatus(`Error: ${error.message || "Failed to save steps"}`);
    } finally {
      setSaving(false);
    }
  };

  if (!campaignId) {
    return (
      <div className="p-6 bg-gray-50 rounded-lg text-center text-gray-500">
        Please select a campaign to build a sequence
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Multi-Step Sequence</h3>
          <p className="text-sm text-gray-600">
            Create follow-up emails that send automatically until a reply is detected
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={addStep}
            className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            ➕ Add Step
          </button>
          <button
            onClick={saveSteps}
            disabled={saving || loading}
            className="px-4 py-2 bg-black text-white rounded-lg hover:opacity-90 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving..." : "Save Sequence"}
          </button>
        </div>
      </div>

      {loading && (
        <div className="text-center py-8 text-gray-500">Loading steps...</div>
      )}

      {!loading && (
        <>
          <div className="space-y-4">
            {steps.length === 0 ? (
              <div className="p-8 bg-gray-50 rounded-lg text-center text-gray-500">
                No steps yet. Click "Add Step" to create your first email.
              </div>
            ) : (
              steps.map((step, index) => (
                <div
                  key={index}
                  className="border border-gray-200 rounded-lg p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">Step {step.step_number}</h4>
                    <button
                      onClick={() => removeStep(index)}
                      className="px-3 py-1 text-sm bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors"
                    >
                      Remove
                    </button>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Subject
                    </label>
                    <input
                      type="text"
                      value={step.subject}
                      onChange={(e) =>
                        updateStep(index, "subject", e.target.value)
                      }
                      className="w-full border rounded-lg p-2"
                      placeholder="Hey {{first_name}} — quick question"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Use {"{{first_name}}"}, {"{{company}}"}, etc.
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Body
                    </label>
                    {proofSnippets.length > 0 ? (
                      <div className="mb-2 flex items-center gap-2">
                        <select
                          value={proofSnippetId}
                          onChange={(e) => setProofSnippetId(e.target.value)}
                          className="border rounded-lg p-2 text-sm bg-white"
                          title="Approved case study snippets (admin-only)"
                        >
                          {proofSnippets.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.title}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => insertProofSnippet(index)}
                          className="px-3 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-sm"
                        >
                          Insert proof
                        </button>
                      </div>
                    ) : null}
                    <textarea
                      value={step.body}
                      onChange={(e) =>
                        updateStep(index, "body", e.target.value)
                      }
                      className="w-full border rounded-lg p-2 min-h-[120px] font-mono text-sm"
                      placeholder="<p>Hi {{first_name}}, ...</p>"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Delay (days)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={step.delay_days}
                      onChange={(e) =>
                        updateStep(index, "delay_days", parseInt(e.target.value) || 0)
                      }
                      className="w-full border rounded-lg p-2"
                      placeholder="3"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      {step.step_number === 1
                        ? "Step 1 sends immediately when campaign starts"
                        : `Sends ${step.delay_days} days after Step ${step.step_number - 1}`}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>

          {status && (
            <div
              className={`p-3 rounded-lg ${
                status.includes("✅")
                  ? "bg-green-50 text-green-700"
                  : status.includes("Error")
                  ? "bg-red-50 text-red-700"
                  : "bg-blue-50 text-blue-700"
              }`}
            >
              {status}
            </div>
          )}

          {steps.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800">
                <strong>💡 How it works:</strong> Emails will be sent in order based on
                delay days. If a lead replies, all remaining steps are automatically
                canceled.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

