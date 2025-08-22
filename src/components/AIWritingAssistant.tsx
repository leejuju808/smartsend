"use client";

import { useState, useEffect, useCallback } from "react";
import { AISuggestion, AIOptimizationResult } from "@/types/database";
import { SparklesIcon, LightBulbIcon, ChartBarIcon } from "@heroicons/react/24/outline";

interface AIWritingAssistantProps {
  subject: string;
  body: string;
  tone: string;
  targetAudience: string;
  productService: string;
  onSubjectChange: (subject: string) => void;
  onBodyChange: (body: string) => void;
  onToneChange: (tone: string) => void;
  templateId?: string;
}

export default function AIWritingAssistant({
  subject,
  body,
  tone,
  targetAudience,
  productService,
  onSubjectChange,
  onBodyChange,
  onToneChange,
  templateId
}: AIWritingAssistantProps) {
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [suggestions, setSuggestions] = useState<AISuggestion[]>([]);
  const [overallScore, setOverallScore] = useState<number | null>(null);
  const [performanceNotes, setPerformanceNotes] = useState<string>("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [currentScore, setCurrentScore] = useState<number | null>(null);
  const [isScoring, setIsScoring] = useState(false);

  // Auto-score email when content changes
  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      if (subject && body && tone && targetAudience && productService) {
        scoreEmail();
      }
    }, 2000);

    return () => clearTimeout(debounceTimer);
  }, [subject, body, tone, targetAudience, productService]);

  const scoreEmail = async () => {
    if (!subject || !body) return;
    
    setIsScoring(true);
    try {
      const response = await fetch("/api/ai-writing/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          body,
          tone,
          targetAudience,
          productService
        })
      });

      if (response.ok) {
        const data = await response.json();
        setCurrentScore(data.score);
      }
    } catch (error) {
      console.error("Error scoring email:", error);
    } finally {
      setIsScoring(false);
    }
  };

  const optimizeWithAI = async () => {
    if (!subject || !body) return;

    setIsOptimizing(true);
    try {
      const response = await fetch("/api/ai-writing/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: {
            subject,
            body,
            tone,
            targetAudience,
            productService
          },
          focusAreas: ["subject", "body", "tone", "personalization"],
          templateId
        })
      });

      if (response.ok) {
        const data: AIOptimizationResult = await response.json();
        setSuggestions(data.suggestions);
        setOverallScore(data.overall_score);
        setPerformanceNotes(data.performance_notes);
        setShowSuggestions(true);
      }
    } catch (error) {
      console.error("Error optimizing with AI:", error);
    } finally {
      setIsOptimizing(false);
    }
  };

  const applySuggestion = useCallback((suggestion: AISuggestion) => {
    switch (suggestion.type) {
      case "subject":
        onSubjectChange(suggestion.content);
        break;
      case "body":
        onBodyChange(suggestion.content);
        break;
      case "tone":
        onToneChange(suggestion.content.toLowerCase());
        break;
      case "personalization":
        // For personalization, we'll add tokens to the body
        const tokens = ["{{first_name}}", "{{company}}", "{{industry}}"];
        const enhancedBody = body + "\n\nPersonalization tokens: " + tokens.join(", ");
        onBodyChange(enhancedBody);
        break;
    }
  }, [onSubjectChange, onBodyChange, onToneChange, body]);

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600";
    return "text-red-600";
  };

  const getScoreLabel = (score: number) => {
    if (score >= 80) return "Excellent";
    if (score >= 60) return "Good";
    return "Needs Work";
  };

  return (
    <div className="space-y-4">
      {/* AI Score Display */}
      {currentScore !== null && (
        <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl">
          <ChartBarIcon className="w-5 h-5 text-gray-600" />
          <div className="flex-1">
            <div className="text-sm text-gray-600">AI Email Score</div>
            <div className="flex items-center gap-2">
              <span className={`text-2xl font-bold ${getScoreColor(currentScore)}`}>
                {currentScore}/100
              </span>
              <span className={`text-sm px-2 py-1 rounded-full ${getScoreColor(currentScore)} bg-opacity-10`}>
                {getScoreLabel(currentScore)}
              </span>
            </div>
          </div>
          {isScoring && (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600"></div>
          )}
        </div>
      )}

      {/* Optimize with AI Button */}
      <button
        onClick={optimizeWithAI}
        disabled={isOptimizing || !subject || !body}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl font-medium hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
      >
        {isOptimizing ? (
          <>
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            Optimizing with AI...
          </>
        ) : (
          <>
            <SparklesIcon className="w-5 h-5" />
            🔥 Optimize with AI
          </>
        )}
      </button>

      {/* AI Suggestions */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-lg font-semibold text-gray-800">
            <LightBulbIcon className="w-6 h-6 text-yellow-500" />
            AI Suggestions
            {overallScore && (
              <span className={`ml-auto text-sm px-3 py-1 rounded-full ${getScoreColor(overallScore)} bg-opacity-10`}>
                Overall: {overallScore}/100
              </span>
            )}
          </div>

          {/* Performance Notes */}
          {performanceNotes && (
            <div className="p-4 bg-blue-50 rounded-xl border-l-4 border-blue-400">
              <div className="text-sm font-medium text-blue-800 mb-2">Performance Insights</div>
              <div className="text-sm text-blue-700">{performanceNotes}</div>
            </div>
          )}

          {/* Suggestions by Type */}
          {["subject", "body", "tone", "personalization"].map((type) => {
            const typeSuggestions = suggestions.filter(s => s.type === type);
            if (typeSuggestions.length === 0) return null;

            return (
              <div key={type} className="space-y-3">
                <h4 className="text-sm font-medium text-gray-700 capitalize">
                  {type} Improvements
                </h4>
                <div className="space-y-2">
                  {typeSuggestions.map((suggestion, index) => (
                    <div
                      key={index}
                      className="p-3 bg-white border rounded-lg hover:shadow-sm transition-shadow"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="text-sm text-gray-800 mb-1">
                            {suggestion.content}
                          </div>
                          <div className="text-xs text-gray-500">
                            {suggestion.reasoning}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs px-2 py-1 rounded-full ${getScoreColor(suggestion.score)} bg-opacity-10`}>
                            {suggestion.score}/100
                          </span>
                          <button
                            onClick={() => applySuggestion(suggestion)}
                            className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
                          >
                            Apply
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
} 