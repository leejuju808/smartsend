"use client";

import { useState } from "react";
import TemplateRewriter from "@/components/_components/TemplateRewriter";

export default function ComposePage() {
  const [subject, setSubject] = useState("Quick question for {{first_name}}");
  const [body, setBody] = useState(`Hey {{first_name}},

We help {{company}} turn {{problem}} into {{offer}} — worth a 7‑minute chat?

– Julian`);

  async function handleApply(variant: { subject: string; body: string }, asVariant?: "A" | "B") {
    // Replace main editor values with the selected variant
    setSubject(variant.subject);
    setBody(variant.body);
    
    // Optional: If you support A/B variants, you can store them
    // For example, if asVariant is provided, you might want to:
    // if (asVariant) {
    //   // Save variant to campaign_email_variants or similar
    //   console.log(`Applied variant ${asVariant}`, variant);
    // }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Email Composer with Smart Rewriter</h1>
      
      <div className="grid md:grid-cols-2 gap-6">
        {/* Left: Main Editor */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Email Editor</h2>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Subject
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Body
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[300px] font-mono text-sm"
            />
          </div>

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <h3 className="font-medium text-gray-900 mb-2">Current Values</h3>
            <div className="space-y-2 text-sm">
              <div>
                <span className="font-medium text-gray-600">Subject:</span>{" "}
                <span className="text-gray-900">{subject}</span>
              </div>
              <div>
                <span className="font-medium text-gray-600">Body:</span>
                <pre className="mt-1 whitespace-pre-wrap text-gray-900">{body}</pre>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Rewriter Panel */}
        <div>
          <h2 className="text-lg font-semibold mb-4">AI Rewriter</h2>
          <TemplateRewriter
            initialSubject={subject}
            initialBody={body}
            onApplyVariant={handleApply}
          />
        </div>
      </div>

      {/* Info Section */}
      <div className="mt-8 rounded-lg border border-blue-200 bg-blue-50 p-4">
        <h3 className="font-semibold text-blue-900 mb-2">How to Use</h3>
        <ul className="list-disc pl-5 space-y-1 text-sm text-blue-800">
          <li>Enter your email subject and body on the left</li>
          <li>Configure the rewiter parameters (goal, tone, length, etc.)</li>
          <li>Click "Generate 3 Variants" to get AI-powered alternatives</li>
          <li>Click "Use Variant" to apply it to your editor</li>
          <li>All merge tags ({'{{first_name}}'}, {'{{company}}'}, etc.) are preserved</li>
        </ul>
      </div>
    </div>
  );
}

