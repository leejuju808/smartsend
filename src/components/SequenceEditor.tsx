'use client';

import { useState } from 'react';
import { useRewriter } from '@/hooks/useRewriter';

type Step = { 
  position: number; 
  subject: string; 
  body_html: string; 
  wait_days: number;
  send_window?: {
    tz: string;
    start: string;
    end: string;
    weekdays: number[];
  };
};

interface SequenceEditorProps {
  campaignId: string;
  workspaceId: string;
  onSave?: () => void;
}

export function SequenceEditor({ campaignId, workspaceId, onSave }: SequenceEditorProps) {
  const [steps, setSteps] = useState<Step[]>([
    { 
      position: 1, 
      subject: 'Quick hello for {{first_name}}', 
      body_html: '<p>Hi {{first_name}}, thanks for your interest...</p>', 
      wait_days: 0,
      send_window: {
        tz: 'America/Los_Angeles',
        start: '09:00',
        end: '16:30',
        weekdays: [1,2,3,4,5]
      }
    },
    { 
      position: 2, 
      subject: 'Following up, {{first_name}}', 
      body_html: '<p>Just following up on my previous message...</p>', 
      wait_days: 3,
      send_window: {
        tz: 'America/Los_Angeles',
        start: '09:00',
        end: '16:30',
        weekdays: [1,2,3,4,5]
      }
    },
  ]);
  const [name, setName] = useState('Default Sequence');
  const [saving, setSaving] = useState(false);
  const { rewrite, loading: rewriting } = useRewriter();
  const [rewritingStepIndex, setRewritingStepIndex] = useState<number | null>(null);

  function addStep() {
    const position = steps.length + 1;
    setSteps([
      ...steps, 
      { 
        position, 
        subject: '', 
        body_html: '', 
        wait_days: 3,
        send_window: {
          tz: 'America/Los_Angeles',
          start: '09:00',
          end: '16:30',
          weekdays: [1,2,3,4,5]
        }
      }
    ]);
  }

  function removeStep(index: number) {
    setSteps(steps.filter((_, i) => i !== index));
  }

  async function handleRewrite(stepIndex: number, mode: string = "warmer") {
    const step = steps[stepIndex];
    if (!step || !step.body_html.trim()) return;

    setRewritingStepIndex(stepIndex);
    try {
      // Strip HTML tags for rewriting, then restore basic HTML structure
      const plainText = step.body_html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      if (!plainText) return;

      const rewritten = await rewrite(plainText, mode);
      
      // Preserve variables and basic HTML structure
      // Convert newlines to <br> and wrap in <p> if needed
      let htmlRewritten = rewritten
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .map(line => `<p>${line}</p>`)
        .join('');

      // Preserve any {{variables}} that might have been in the original
      const originalVars = step.body_html.match(/\{\{[^}]+\}\}/g) || [];
      originalVars.forEach((varName) => {
        if (!htmlRewritten.includes(varName)) {
          // Try to add back variables if they're missing (simple heuristic)
          htmlRewritten = htmlRewritten.replace(/\{\{[^}]+\}\}/g, varName);
        }
      });

      setSteps(prev => 
        prev.map((p, idx) => idx === stepIndex ? { ...p, body_html: htmlRewritten || rewritten } : p)
      );
    } catch (error: any) {
      console.error("Error rewriting:", error);
      alert(error.message || "Failed to rewrite");
    } finally {
      setRewritingStepIndex(null);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const response = await fetch(`/api/sequences/${campaignId}/upsert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspaceId, name, steps })
      });
      
      if (!response.ok) {
        const error = await response.json();
        alert(`Save failed: ${error.error || 'Unknown error'}`);
        return;
      }
      
      alert('Sequence saved successfully!');
      if (onSave) onSave();
    } catch (error: any) {
      alert(`Save failed: ${error.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-3 items-center">
        <input 
          value={name} 
          onChange={e => setName(e.target.value)} 
          className="border rounded-xl px-3 py-2 flex-1"
          placeholder="Sequence name"
        />
        <button 
          onClick={addStep} 
          className="px-4 py-2 rounded-xl border border-gray-300 hover:bg-gray-50 transition"
        >
          Add Step
        </button>
        <button 
          onClick={save}
          disabled={saving}
          className="px-6 py-2 rounded-2xl bg-black text-white hover:bg-gray-800 disabled:opacity-50 transition"
        >
          {saving ? 'Saving...' : 'Save Sequence'}
        </button>
      </div>

      <div className="space-y-4">
        {steps.map((s, i) => (
          <div key={i} className="border rounded-xl p-6 space-y-3">
            <div className="flex items-start justify-between">
              <h3 className="font-semibold text-lg">Step {s.position}</h3>
              {steps.length > 1 && (
                <button
                  onClick={() => removeStep(i)}
                  className="text-red-500 hover:text-red-700 px-2 py-1 text-sm"
                >
                  Remove
                </button>
              )}
            </div>
            
            <div className="flex gap-3 items-center">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Subject Line
                </label>
                <input 
                  placeholder="Email subject with {{variables}}" 
                  value={s.subject}
                  onChange={e => setSteps(prev => 
                    prev.map((p, idx) => idx === i ? { ...p, subject: e.target.value } : p)
                  )}
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>
              
              <div className="w-32">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Wait Days
                </label>
                <input 
                  type="number" 
                  min={0} 
                  value={s.wait_days}
                  onChange={e => setSteps(prev => 
                    prev.map((p, idx) => idx === i ? { ...p, wait_days: +e.target.value } : p)
                  )}
                  className="w-full border rounded-lg px-2 py-2"
                />
              </div>
            </div>
            
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-gray-700">
                  Email Body (HTML)
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleRewrite(i, "warmer")}
                    disabled={rewriting && rewritingStepIndex === i}
                    className="px-3 py-1 text-xs rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 transition flex items-center gap-1"
                    title="Make it warmer"
                  >
                    ✨ Warmer
                  </button>
                  <button
                    onClick={() => handleRewrite(i, "shorter")}
                    disabled={rewriting && rewritingStepIndex === i}
                    className="px-3 py-1 text-xs rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 transition flex items-center gap-1"
                    title="Make it shorter"
                  >
                    ✨ Shorter
                  </button>
                  <button
                    onClick={() => handleRewrite(i, "formal")}
                    disabled={rewriting && rewritingStepIndex === i}
                    className="px-3 py-1 text-xs rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 transition flex items-center gap-1"
                    title="Make it more formal"
                  >
                    ✨ Formal
                  </button>
                </div>
              </div>
              <textarea
                value={s.body_html}
                onChange={e => setSteps(prev => 
                  prev.map((p, idx) => idx === i ? { ...p, body_html: e.target.value } : p)
                )}
                className="w-full min-h-[160px] border rounded-lg px-3 py-2 font-mono text-sm"
                placeholder="Your email body HTML here..."
                disabled={rewriting && rewritingStepIndex === i}
              />
              {rewriting && rewritingStepIndex === i && (
                <div className="text-xs text-blue-500 mt-1">Rewriting...</div>
              )}
            </div>

            <div className="text-xs text-gray-500">
              Tip: Use {'{{variables}}'} like {'{{first_name}}, {{company}}'} in your content
            </div>
          </div>
        ))}
      </div>

      {steps.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          <p>No steps yet. Click "Add Step" to create your first sequence step.</p>
        </div>
      )}
    </div>
  );
}
