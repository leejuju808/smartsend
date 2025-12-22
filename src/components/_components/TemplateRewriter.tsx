"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";

type Variant = {
  subject: string;
  body: string;
};

type Props = {
  initialSubject: string;
  initialBody: string;
  onApplyVariant: (variant: Variant, asVariant?: "A" | "B") => void;
};

export default function TemplateRewriter({ initialSubject, initialBody, onApplyVariant }: Props) {
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [goal, setGoal] = useState<"meeting-ask" | "demo-request" | "information" | "soft-intro" | "follow-up">("meeting-ask");
  const [tone, setTone] = useState<"professional" | "casual" | "friendly" | "direct" | "conversational">("professional");
  const [length, setLength] = useState<"short" | "medium" | "long">("short");
  const [readingLevel, setReadingLevel] = useState<"5th" | "8th" | "12th" | "college">("8th");
  const [reduceSpam, setReduceSpam] = useState(true);
  const [loading, setLoading] = useState(false);
  const [variants, setVariants] = useState<Array<{ subject: string; body: string }> | null>(null);

  async function generate() {
    setLoading(true);
    setVariants(null);
    try {
      const res = await fetch("/api/rewrite-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          body,
          goal,
          tone,
          length,
          readingLevel,
          reduceSpam
        })
      });

      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || "Failed to generate variants");
      }

      setVariants(data.variants || []);
    } catch (e: any) {
      alert(e.message || "Failed to generate variants");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-xl border bg-white p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Sparkles className="w-5 h-5 text-blue-600" />
        <h3 className="text-lg font-semibold">Smart Template Rewriter</h3>
      </div>

      {/* Inputs */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Subject Line
          </label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Quick question for {{first_name}}"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Email Body
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[120px] font-mono text-sm"
            placeholder={`Hey {{first_name}},\n\nWe help {{company}} turn {{problem}} into {{offer}} — worth a 7‑minute chat?\n\n– Julian`}
          />
        </div>
      </div>

      {/* Controls */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Goal</label>
          <select
            value={goal}
            onChange={(e) => setGoal(e.target.value as any)}
            className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="meeting-ask">Meeting Ask</option>
            <option value="demo-request">Demo Request</option>
            <option value="information">Information</option>
            <option value="soft-intro">Soft Intro</option>
            <option value="follow-up">Follow-Up</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Tone</label>
          <select
            value={tone}
            onChange={(e) => setTone(e.target.value as any)}
            className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="professional">Professional</option>
            <option value="casual">Casual</option>
            <option value="friendly">Friendly</option>
            <option value="direct">Direct</option>
            <option value="conversational">Conversational</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Length</label>
          <select
            value={length}
            onChange={(e) => setLength(e.target.value as any)}
            className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="short">Short</option>
            <option value="medium">Medium</option>
            <option value="long">Long</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Reading Level</label>
          <select
            value={readingLevel}
            onChange={(e) => setReadingLevel(e.target.value as any)}
            className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="5th">5th Grade</option>
            <option value="8th">8th Grade</option>
            <option value="12th">12th Grade</option>
            <option value="college">College</option>
          </select>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="reduceSpam"
          checked={reduceSpam}
          onChange={(e) => setReduceSpam(e.target.checked)}
          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        <label htmlFor="reduceSpam" className="text-sm text-gray-700">
          Reduce spam triggers
        </label>
      </div>

      <button
        onClick={generate}
        disabled={loading || !subject.trim() || !body.trim()}
        className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-white font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Generating variants...
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4" />
            Generate 3 Variants
          </>
        )}
      </button>

      {/* Results */}
      {variants && (
        <div className="space-y-4 pt-4 border-t">
          <h4 className="font-semibold text-gray-900">Generated Variants</h4>
          <div className="grid md:grid-cols-3 gap-4">
            {variants.map((variant, idx) => (
              <div
                key={idx}
                className="rounded-lg border border-gray-200 p-4 space-y-3 hover:border-blue-400 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-blue-600">
                    Variant {String.fromCharCode(65 + idx)}
                  </span>
                </div>
                
                <div>
                  <div className="text-xs font-medium text-gray-500 mb-1">Subject</div>
                  <div className="text-sm font-medium text-gray-900">
                    {variant.subject}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-medium text-gray-500 mb-1">Body</div>
                  <div className="text-sm text-gray-700 whitespace-pre-wrap">
                    {variant.body}
                  </div>
                </div>

                <button
                  onClick={() => onApplyVariant(variant, String.fromCharCode(65 + idx) as "A" | "B")}
                  className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-50"
                >
                  Use Variant {String.fromCharCode(65 + idx)}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

