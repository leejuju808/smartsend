"use client";

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClientComponentClient } from '@/lib/supabase';
import { Plus, Save, Trash2, ArrowRight, Calendar, Sparkles, RotateCcw, Loader2 } from 'lucide-react';
import VarMenu from '@/components/VarMenu';
import RewriterPanel from '@/components/RewriterPanel';
import { StepVariants } from '@/components/campaigns/StepVariants';
import { AITemplateRewriter } from '@/components/campaigns/AITemplateRewriter';
import { toast } from 'sonner';

interface CampaignStep {
  id?: string;
  step_index: number;
  subject: string;
  body_html: string;
  delay_days: number;
}

interface Campaign {
  id: string;
  name: string;
  is_sequence: boolean;
}

export default function CampaignStepsPage() {
  const params = useParams();
  const router = useRouter();
  const supabase = createClientComponentClient();
  const campaignId = params.id as string;

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [steps, setSteps] = useState<CampaignStep[]>([
    { step_index: 0, subject: '', body_html: '', delay_days: 0 }
  ]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [variantRefresh, setVariantRefresh] = useState(0);
  const [rewritingStepIndex, setRewritingStepIndex] = useState<number | null>(null);
  const [stepHistory, setStepHistory] = useState<Record<number, string>>({});

  useEffect(() => {
    if (campaignId) {
      fetchCampaignAndSteps();
    }
  }, [campaignId]);

  const fetchCampaignAndSteps = async () => {
    try {
      // Fetch campaign details
      const { data: campaignData, error: campaignError } = await supabase
        .from('campaigns')
        .select('id, name, is_sequence')
        .eq('id', campaignId)
        .single();

      if (campaignError) throw campaignError;
      setCampaign(campaignData);

      // Fetch existing steps
      const { data: stepsData, error: stepsError } = await supabase
        .from('campaign_steps')
        .select('*')
        .eq('campaign_id', campaignId)
        .order('step_index', { ascending: true });

      if (stepsError) throw stepsError;

      if (stepsData && stepsData.length > 0) {
        setSteps(stepsData);
      } else {
        // Initialize with default steps for D0/D3/D7
        setSteps([
          { step_index: 0, subject: '', body_html: '', delay_days: 0 },
          { step_index: 1, subject: '', body_html: '', delay_days: 3 },
          { step_index: 2, subject: '', body_html: '', delay_days: 7 }
        ]);
      }
    } catch (error) {
      console.error('Error fetching campaign steps:', error);
      setError('Failed to load campaign steps');
    } finally {
      setLoading(false);
    }
  };

  const addStep = () => {
    const newStepIndex = steps.length;
    setSteps([...steps, {
      step_index: newStepIndex,
      subject: '',
      body_html: '',
      delay_days: newStepIndex === 0 ? 0 : 3
    }]);
  };

  const removeStep = (index: number) => {
    if (steps.length <= 1) return; // Keep at least one step
    const newSteps = steps.filter((_, i) => i !== index);
    // Reindex steps
    const reindexedSteps = newSteps.map((step, i) => ({
      ...step,
      step_index: i
    }));
    setSteps(reindexedSteps);
  };

  const updateStep = (index: number, field: keyof CampaignStep, value: string | number) => {
    const newSteps = [...steps];
    newSteps[index] = { ...newSteps[index], [field]: value };
    setSteps(newSteps);
  };

  const previewStep = async (step: CampaignStep) => {
    try {
      const res = await fetch("/api/preview/sequence-step", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject: step.subject, body: step.body_html })
      });
      const data = await res.json();
      alert(`Preview:\n\nSubject: ${data.subject}\n\nBody:\n${data.body}`);
    } catch (error) {
      alert("Failed to preview step");
    }
  };

  // Variable safety check
  function ensureVariablesIntact(original: string, rewritten: string): boolean {
    const vars = original.match(/{{[^}]+}}/g) || [];
    for (const v of vars) {
      if (!rewritten.includes(v)) return false;
    }
    return true;
  }

  // AI Rewrite handler
  const handleRewrite = async (stepIndex: number, mode: "shorten" | "improve" | "punchy") => {
    const step = steps[stepIndex];
    if (!step.body_html.trim()) {
      toast.error("Please enter email body to rewrite");
      return;
    }

    // Store previous version for undo
    setStepHistory(prev => ({
      ...prev,
      [stepIndex]: step.body_html
    }));

    setRewritingStepIndex(stepIndex);
    try {
      const resp = await fetch("/api/rewriter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: step.body_html,
          mode
        })
      });

      if (!resp.ok) {
        const errorData = await resp.json();
        throw new Error(errorData.error || "Failed to rewrite template");
      }

      const data = await resp.json();
      const rewritten = data.rewritten || step.body_html;

      // Check variable safety
      if (!ensureVariablesIntact(step.body_html, rewritten)) {
        toast.error("Warning: Some template variables may have been removed. Please review.");
      }

      // Update the step with rewritten content
      updateStep(stepIndex, 'body_html', rewritten);
      toast.success("Email rewritten successfully!");
    } catch (error: any) {
      console.error("Rewrite error:", error);
      toast.error(error.message || "Failed to rewrite template");
    } finally {
      setRewritingStepIndex(null);
    }
  };

  // Undo handler
  const handleUndo = (stepIndex: number) => {
    const previousVersion = stepHistory[stepIndex];
    if (previousVersion) {
      updateStep(stepIndex, 'body_html', previousVersion);
      setStepHistory(prev => {
        const newHistory = { ...prev };
        delete newHistory[stepIndex];
        return newHistory;
      });
      toast.success("Changes reverted");
    }
  };

  const saveSteps = async () => {
    try {
      setSaving(true);
      setError(null);

      // Validate steps
      if (steps.some(step => !step.subject.trim() || !step.body_html.trim())) {
        setError('All steps must have a subject and body');
        return;
      }

      // Update step indices to match array order
      const stepsToSave = steps.map((step, index) => ({
        ...step,
        step_index: index
      }));

      const response = await fetch('/api/campaigns/steps/upsert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaign_id: campaignId,
          steps: stepsToSave
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save steps');
      }

      setSuccess('Campaign steps saved successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (error: any) {
      console.error('Error saving steps:', error);
      setError(error.message || 'Failed to save steps');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-32 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="p-6">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-gray-900">Campaign not found</h1>
          <p className="text-gray-600 mt-2">The campaign you're looking for doesn't exist.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Campaign Steps</h1>
            <p className="text-gray-600 mt-1">
              {campaign.name} • {campaign.is_sequence ? 'Sequence Campaign' : 'Single Campaign'}
            </p>
          </div>
          <button
            onClick={() => router.back()}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Back to Campaign
          </button>
        </div>
      </div>

      {/* Error/Success Messages */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-md">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-md">
          <p className="text-green-800">{success}</p>
        </div>
      )}

      {/* Steps Editor */}
      <div className="space-y-6">
        {steps.map((step, index) => (
          <div key={index} className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className="flex items-center justify-center w-8 h-8 bg-blue-100 text-blue-600 rounded-full font-semibold">
                  {index + 1}
                </div>
                <div>
                  <h3 className="text-lg font-medium text-gray-900">
                    Step {index + 1}
                    {index === 0 && <span className="ml-2 text-sm text-gray-500">(Initial)</span>}
                  </h3>
                  {index > 0 && (
                    <div className="flex items-center text-sm text-gray-500">
                      <Calendar className="w-4 h-4 mr-1" />
                      {step.delay_days} days after previous step
                    </div>
                  )}
                </div>
              </div>
              {steps.length > 1 && (
                <button
                  onClick={() => removeStep(index)}
                  className="p-2 text-red-600 hover:bg-red-50 rounded-md"
                  title="Remove step"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Delay Days */}
              {index > 0 && (
                <div className="lg:col-span-1">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Delay (days)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={step.delay_days}
                    onChange={(e) => updateStep(index, 'delay_days', parseInt(e.target.value) || 1)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              {/* Subject */}
              <div className={index > 0 ? 'lg:col-span-2' : 'lg:col-span-3'}>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Subject Line
                </label>
                <input
                  type="text"
                  value={step.subject}
                  onChange={(e) => updateStep(index, 'subject', e.target.value)}
                  placeholder="Enter your email subject..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <div className="mt-2">
                  <VarMenu onPick={(snippet) => updateStep(index, 'subject', step.subject + " " + snippet)} />
                </div>
              </div>

              {/* Body */}
              <div className="lg:col-span-3">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Email Body
                  </label>
                  <div className="flex items-center gap-2">
                    {stepHistory[index] && (
                      <button
                        onClick={() => handleUndo(index)}
                        className="flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded"
                        title="Undo rewrite"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Undo
                      </button>
                    )}
                    {rewritingStepIndex === index && (
                      <span className="flex items-center gap-1 text-xs text-blue-600">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Rewriting...
                      </span>
                    )}
                  </div>
                </div>
                {/* AI Rewrite Buttons */}
                <div className="mb-2 flex items-center gap-2 flex-wrap">
                  <AITemplateRewriter
                    body={step.body_html}
                    onApply={(rewrittenBody) => {
                      updateStep(index, 'body_html', rewrittenBody);
                      toast.success("Email rewritten successfully!");
                    }}
                    campaignId={campaignId}
                    stepIndex={index}
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleRewrite(index, "improve")}
                      disabled={rewritingStepIndex !== null}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Sparkles className="w-3 h-3" />
                      Improve
                    </button>
                    <button
                      onClick={() => handleRewrite(index, "shorten")}
                      disabled={rewritingStepIndex !== null}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Sparkles className="w-3 h-3" />
                      Shorten
                    </button>
                    <button
                      onClick={() => handleRewrite(index, "punchy")}
                      disabled={rewritingStepIndex !== null}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Sparkles className="w-3 h-3" />
                      Make Punchy
                    </button>
                  </div>
                </div>
                <textarea
                  value={step.body_html}
                  onChange={(e) => updateStep(index, 'body_html', e.target.value)}
                  placeholder="Enter your email body... You can use {{name}}, {{company}}, {{email}} for personalization"
                  rows={6}
                  disabled={rewritingStepIndex === index}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                />
                {rewritingStepIndex === index && (
                  <div className="mt-1 text-xs text-blue-600 flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Rewriting with AI...
                  </div>
                )}
                {stepHistory[index] && rewritingStepIndex !== index && (
                  <div className="mt-1 text-xs text-gray-500 flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    Rewritten by AI
                  </div>
                )}
                <div className="mt-2">
                  <VarMenu onPick={(snippet) => updateStep(index, 'body_html', step.body_html + "\n" + snippet)} />
                </div>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => previewStep(step)}
                    className="px-3 py-1.5 rounded bg-gray-800 hover:bg-gray-700 text-sm text-white"
                  >
                    Preview Render
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Available variables: {'{{first_name}}'} {'{{company}}'} {'{{title}}'} {'{{email}}'} {'{{custom.industry}}'}
                </p>
              </div>
            </div>

            {/* Smart Rewriter Panel */}
            <div className="mt-6 pt-6 border-t border-gray-200">
              <RewriterPanel
                campaignId={campaignId}
                stepNo={step.step_index}
                baseSubject={step.subject}
                baseHtml={step.body_html}
                onSavedVariant={(vid) => {
                  toast.success(`Variant created: ${vid}`);
                  setVariantRefresh((v) => v + 1);
                }}
              />
            </div>

            {/* A/B Variants Panel */}
            <div className="mt-6 pt-6 border-t border-gray-200">
              <StepVariants 
                campaignId={campaignId} 
                stepNo={step.step_index}
                refreshToken={variantRefresh}
              />
            </div>

            {/* Step Flow Indicator */}
            {index < steps.length - 1 && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="flex items-center justify-center text-gray-400">
                  <ArrowRight className="w-5 h-5" />
                  <span className="ml-2 text-sm">
                    {step.delay_days} day{step.delay_days !== 1 ? 's' : ''} later
                  </span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add Step Button */}
      <div className="mt-6">
        <button
          onClick={addStep}
          className="flex items-center px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Another Step
        </button>
      </div>

      {/* Save Button */}
      <div className="mt-8 pt-6 border-t border-gray-200">
        <button
          onClick={saveSteps}
          disabled={saving}
          className="flex items-center px-6 py-3 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
              Saving...
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" />
              Save Campaign Steps
            </>
          )}
        </button>
      </div>

      {/* Help Text */}
      <div className="mt-8 p-4 bg-gray-50 rounded-lg">
        <h4 className="font-medium text-gray-900 mb-2">How it works:</h4>
        <ul className="text-sm text-gray-600 space-y-1">
          <li>• <strong>Step 1:</strong> Initial email sent immediately when campaign starts</li>
          <li>• <strong>Step 2+:</strong> Follow-up emails sent automatically after the specified delay</li>
          <li>• <strong>Auto-stop:</strong> Sequence stops if contact replies or unsubscribes</li>
          <li>• <strong>Personalization:</strong> Use {'{{first_name}}'}, {'{{company}}'}, {'{{title}}'}, {'{{email}}'}, {'{{custom.industry}}'} in your content</li>
          <li>• <strong>Filters:</strong> Use {'{{first_name | fallback:"there"}}'} or {'{{company | titlecase}}'} for formatting</li>
        </ul>
      </div>
    </div>
  );
} 