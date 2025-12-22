// Block 21912 — SmartSend Roofing Job Probability Explainer v1
// 📊 "Why Is This Job at 62%?" — Transparent AI That Roofers Trust

"use client";

import { useEffect, useState } from "react";

interface ProbabilityExplanation {
  positive_factors: string[];
  negative_factors: string[];
  risk_drivers: string[];
  action_recommendations: string[];
  confidence: number;
}

interface ProbabilityExplanationCardProps {
  leadId: string;
  probability: number | null;
  explanation?: ProbabilityExplanation | null;
  onExplanationGenerated?: (explanation: ProbabilityExplanation) => void;
  className?: string;
}

function Section({ 
  title, 
  items, 
  color 
}: { 
  title: string; 
  items: string[]; 
  color: string;
}) {
  if (!items || items.length === 0) return null;

  return (
    <div className="space-y-1">
      <h4 className={`font-semibold text-sm mb-1 ${color}`}>{title}</h4>
      <ul className="list-disc pl-5 text-sm text-gray-200 space-y-0.5">
        {items.map((item, i) => (
          <li key={i} className="leading-relaxed">{item}</li>
        ))}
      </ul>
    </div>
  );
}

export function ProbabilityExplanationCard({ 
  leadId, 
  probability, 
  explanation: initialExplanation,
  onExplanationGenerated,
  className = ""
}: ProbabilityExplanationCardProps) {
  const [explanation, setExplanation] = useState<ProbabilityExplanation | null>(initialExplanation || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generateExplanation() {
    if (!leadId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch("/api/leads/generate-probability-explanation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead_id: leadId }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to generate explanation: ${response.statusText}`);
      }

      const data = await response.json();
      if (data.explanation) {
        setExplanation(data.explanation);
        if (onExplanationGenerated) {
          onExplanationGenerated(data.explanation);
        }
      }
    } catch (err) {
      console.error("Error generating probability explanation:", err);
      setError(err instanceof Error ? err.message : "Failed to generate explanation");
    } finally {
      setLoading(false);
    }
  }

  // Auto-generate explanation if not provided and probability exists
  useEffect(() => {
    if (!explanation && probability !== null && probability !== undefined && !loading) {
      generateExplanation();
    }
  }, [leadId, probability]);

  if (probability === null || probability === undefined) {
    return null;
  }

  return (
    <div className={`p-4 rounded-xl bg-white/5 border border-white/10 space-y-4 ${className}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-white">
          Why This Job Is at {probability}%
        </h3>
        {!explanation && !loading && (
          <button
            onClick={generateExplanation}
            className="text-xs text-gray-400 hover:text-gray-200 underline"
            type="button"
          >
            Generate Explanation
          </button>
        )}
        {loading && (
          <span className="text-xs text-gray-400">Generating...</span>
        )}
      </div>

      {error && (
        <div className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded p-2">
          {error}
          <button
            onClick={generateExplanation}
            className="ml-2 underline"
            type="button"
          >
            Try Again
          </button>
        </div>
      )}

      {loading && !explanation && (
        <div className="space-y-3">
          <div className="animate-pulse space-y-2">
            <div className="h-4 bg-white/10 rounded w-3/4"></div>
            <div className="h-4 bg-white/10 rounded w-1/2"></div>
            <div className="h-4 bg-white/10 rounded w-2/3"></div>
          </div>
        </div>
      )}

      {explanation && (
        <div className="space-y-4">
          <Section 
            title="✅ Positive Factors" 
            items={explanation.positive_factors} 
            color="text-green-400" 
          />
          
          <Section 
            title="⚠️ Negative Factors" 
            items={explanation.negative_factors} 
            color="text-red-400" 
          />
          
          <Section 
            title="🚨 Risk Drivers" 
            items={explanation.risk_drivers} 
            color="text-yellow-300" 
          />

          <div className="space-y-1">
            <h4 className="font-semibold text-sm mb-1 text-blue-400">
              🎯 AI Recommendations
            </h4>
            <ul className="list-disc pl-5 text-sm text-gray-200 space-y-0.5">
              {explanation.action_recommendations.map((rec, i) => (
                <li key={i} className="leading-relaxed">{rec}</li>
              ))}
            </ul>
          </div>

          <div className="pt-2 border-t border-white/10">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-400">AI Confidence:</span>
              <span className={`font-semibold ${
                explanation.confidence >= 80 ? "text-green-400" :
                explanation.confidence >= 60 ? "text-yellow-400" :
                "text-red-400"
              }`}>
                {explanation.confidence}%
              </span>
            </div>
          </div>

          <button
            onClick={generateExplanation}
            disabled={loading}
            className="text-xs text-gray-400 hover:text-gray-200 underline disabled:opacity-50 disabled:cursor-not-allowed"
            type="button"
          >
            {loading ? "Regenerating..." : "Regenerate Explanation"}
          </button>
        </div>
      )}

      {!explanation && !loading && !error && (
        <p className="text-sm text-gray-400">
          Click "Generate Explanation" to see why this job is at {probability}% probability.
        </p>
      )}
    </div>
  );
}









































