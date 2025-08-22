"use client";

import { useState, useEffect } from "react";
import { EmailTemplate, TemplateSuggestion } from "@/types/database";
import { SparklesIcon, CheckIcon, XMarkIcon, ChartBarIcon } from "@heroicons/react/24/outline";

interface AITemplateOptimizerProps {
  template: EmailTemplate;
  onTemplateUpdate: (template: EmailTemplate) => void;
}

export default function AITemplateOptimizer({ template, onTemplateUpdate }: AITemplateOptimizerProps) {
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [suggestions, setSuggestions] = useState<TemplateSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState<TemplateSuggestion | null>(null);

  // Load existing suggestions for this template
  useEffect(() => {
    if (template.id) {
      loadTemplateSuggestions();
    }
  }, [template.id]);

  const loadTemplateSuggestions = async () => {
    try {
      const response = await fetch(`/api/templates/${template.id}/suggestions`);
      if (response.ok) {
        const data = await response.json();
        setSuggestions(data.suggestions || []);
      }
    } catch (error) {
      console.error("Error loading template suggestions:", error);
    }
  };

  const optimizeTemplate = async () => {
    if (!template.id) return;

    setIsOptimizing(true);
    try {
      const response = await fetch("/api/ai-writing/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: {
            subject: template.generated_emails, // Using generated_emails as subject for now
            body: template.generated_emails,
            tone: template.tone,
            targetAudience: template.target_audience,
            productService: template.product_service
          },
          focusAreas: ["subject", "body", "tone", "personalization"],
          templateId: template.id
        })
      });

      if (response.ok) {
        const data = await response.json();
        // Reload suggestions to get the new ones
        await loadTemplateSuggestions();
        setShowSuggestions(true);
      }
    } catch (error) {
      console.error("Error optimizing template:", error);
    } finally {
      setIsOptimizing(false);
    }
  };

  const acceptSuggestion = async (suggestion: TemplateSuggestion) => {
    try {
      const response = await fetch(`/api/templates/suggestions/${suggestion.id}/accept`, {
        method: "POST"
      });

      if (response.ok) {
        // Update the template with the accepted suggestion
        const updatedTemplate = { ...template };
        
        if (suggestion.suggestion_type === "tone") {
          updatedTemplate.tone = suggestion.suggestion as any;
        } else if (suggestion.suggestion_type === "body") {
          updatedTemplate.generated_emails = suggestion.suggestion;
        }
        
        onTemplateUpdate(updatedTemplate);
        
        // Reload suggestions to update acceptance status
        await loadTemplateSuggestions();
      }
    } catch (error) {
      console.error("Error accepting suggestion:", error);
    }
  };

  const rejectSuggestion = async (suggestion: TemplateSuggestion) => {
    try {
      const response = await fetch(`/api/templates/suggestions/${suggestion.id}/reject`, {
        method: "POST"
      });

      if (response.ok) {
        // Reload suggestions to update rejection status
        await loadTemplateSuggestions();
      }
    } catch (error) {
      console.error("Error rejecting suggestion:", error);
    }
  };

  const getSuggestionTypeIcon = (type: string) => {
    switch (type) {
      case "subject":
        return "📧";
      case "body":
        return "✍️";
      case "tone":
        return "🎭";
      case "personalization":
        return "🎯";
      default:
        return "💡";
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600";
    return "text-red-600";
  };

  return (
    <div className="space-y-4">
      {/* Template Performance Notes */}
      {template.performance_notes && (
        <div className="p-4 bg-blue-50 rounded-xl border-l-4 border-blue-400">
          <div className="text-sm font-medium text-blue-800 mb-2">AI Performance Insights</div>
          <div className="text-sm text-blue-700">{template.performance_notes}</div>
        </div>
      )}

      {/* Optimize Template Button */}
      <button
        onClick={optimizeTemplate}
        disabled={isOptimizing}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl font-medium hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 transition-all"
      >
        {isOptimizing ? (
          <>
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            Optimizing Template...
          </>
        ) : (
          <>
            <SparklesIcon className="w-5 h-5" />
            🔥 Optimize Template with AI
          </>
        )}
      </button>

      {/* Existing Suggestions */}
      {suggestions.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-lg font-semibold text-gray-800">
            <ChartBarIcon className="w-6 h-6 text-blue-500" />
            AI Suggestions ({suggestions.filter(s => !s.accepted).length} pending)
          </div>

          <div className="space-y-3">
            {suggestions.map((suggestion) => (
              <div
                key={suggestion.id}
                className={`p-4 border rounded-lg transition-all ${
                  suggestion.accepted 
                    ? 'bg-green-50 border-green-200' 
                    : 'bg-white border-gray-200 hover:shadow-sm'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="text-2xl">
                    {getSuggestionTypeIcon(suggestion.suggestion_type)}
                  </div>
                  
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-medium text-gray-700 capitalize">
                        {suggestion.suggestion_type} Suggestion
                      </span>
                      {suggestion.ai_score && (
                        <span className={`text-xs px-2 py-1 rounded-full ${getScoreColor(suggestion.ai_score)} bg-opacity-10`}>
                          {suggestion.ai_score}/100
                        </span>
                      )}
                      {suggestion.accepted && (
                        <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700">
                          Accepted
                        </span>
                      )}
                    </div>
                    
                    <div className="text-sm text-gray-800 mb-3">
                      {suggestion.suggestion}
                    </div>
                    
                    <div className="text-xs text-gray-500">
                      Suggested on {new Date(suggestion.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  
                  {!suggestion.accepted && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => acceptSuggestion(suggestion)}
                        className="p-2 text-green-600 hover:bg-green-100 rounded-lg transition-colors"
                        title="Accept suggestion"
                      >
                        <CheckIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => rejectSuggestion(suggestion)}
                        className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                        title="Reject suggestion"
                      >
                        <XMarkIcon className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Show Suggestions Toggle */}
      {suggestions.length > 0 && (
        <button
          onClick={() => setShowSuggestions(!showSuggestions)}
          className="text-sm text-gray-600 hover:text-gray-800 underline"
        >
          {showSuggestions ? 'Hide' : 'Show'} AI Suggestions
        </button>
      )}
    </div>
  );
} 