// Block 18800 — SmartSend Roofing Terminology Translator v1
// Terminology Translator Panel Component for Contact Profile

"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Languages,
  AlertTriangle,
  Shield,
  Clock,
  FileText,
  Sparkles,
  TrendingUp,
  Home,
  CloudLightning,
  Wrench,
  DollarSign,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { Alert, AlertDescription } from "@/src/components/ui/Alert";

interface TerminologyTranslation {
  id: string;
  homeowner_message: string;
  roofing_term: string;
  material_type: string | null;
  damage_type: string;
  repair_category: string;
  storm_category: string;
  insurance_category: string;
  urgency_level: string;
  severity_score: number;
  ai_explanation: string;
  detected_keywords: string[];
  keyword_explanations: Record<string, string>;
  detected_material: string | null;
  material_confidence: number;
  storm_impact_score: number;
  replacement_probability: string;
  replacement_likelihood_score: number;
  recommended_action: string;
  recommended_tasks: string[];
  repair_cost_range: { min: number | null; max: number | null };
  translation_confidence: number;
  created_at: string;
}

interface TerminologyTranslatorPanelProps {
  contactId: string;
}

export function TerminologyTranslatorPanel({
  contactId,
}: TerminologyTranslatorPanelProps) {
  const [translations, setTranslations] = useState<TerminologyTranslation[]>([]);
  const [latestTranslation, setLatestTranslation] =
    useState<TerminologyTranslation | null>(null);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordExplanations, setKeywordExplanations] = useState<
    Record<string, string>
  >({});
  const [loading, setLoading] = useState(true);
  const [translating, setTranslating] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTranslations();
  }, [contactId]);

  async function loadTranslations() {
    try {
      setLoading(true);
      const res = await fetch(`/api/terms/${contactId}`);
      const data = await res.json();

      if (data.ok) {
        setTranslations(data.translations || []);
        setLatestTranslation(data.latestTranslation || null);
        setKeywords(data.keywords || []);
        setKeywordExplanations(data.keywordExplanations || {});
      } else {
        setError(data.error || "Failed to load translations");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load translations");
    } finally {
      setLoading(false);
    }
  }

  async function handleTranslate() {
    if (!newMessage.trim()) {
      return;
    }

    try {
      setTranslating(true);
      setError(null);

      const res = await fetch("/api/terms/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: newMessage,
          contactId,
          messageSource: "manual",
        }),
      });

      const data = await res.json();

      if (data.ok) {
        setNewMessage("");
        await loadTranslations(); // Reload to show new translation
      } else {
        setError(data.error || "Failed to translate message");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to translate");
    } finally {
      setTranslating(false);
    }
  }

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case "emergency":
        return "bg-red-100 text-red-800 border-red-300";
      case "high":
        return "bg-orange-100 text-orange-800 border-orange-300";
      case "medium":
        return "bg-yellow-100 text-yellow-800 border-yellow-300";
      case "low":
        return "bg-blue-100 text-blue-800 border-blue-300";
      default:
        return "bg-gray-100 text-gray-800 border-gray-300";
    }
  };

  const getSeverityColor = (score: number) => {
    if (score >= 75) return "text-red-600";
    if (score >= 50) return "text-orange-600";
    if (score >= 25) return "text-yellow-600";
    return "text-blue-600";
  };

  const formatDamageType = (type: string) => {
    return type.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Languages className="h-5 w-5" />
            Terminology Translator
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="h-4 bg-gray-200 rounded animate-pulse" />
            <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4" />
            <div className="h-4 bg-gray-200 rounded animate-pulse w-1/2" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Languages className="h-5 w-5" />
          Terminology Translator
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Translate New Message */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Translate Homeowner Message</label>
          <div className="flex gap-2">
            <Textarea
              placeholder='e.g., "There's a brown spot on my ceiling"'
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              className="flex-1"
              rows={2}
            />
            <Button
              onClick={handleTranslate}
              disabled={translating || !newMessage.trim()}
            >
              {translating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Latest Translation */}
        {latestTranslation && (
          <div className="space-y-4 border-t pt-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">Latest Translation</h3>
              <Badge
                variant="outline"
                className={getUrgencyColor(latestTranslation.urgency_level)}
              >
                {latestTranslation.urgency_level.toUpperCase()}
              </Badge>
            </div>

            {/* Homeowner Message */}
            <div>
              <div className="text-xs text-muted-foreground mb-1">
                Homeowner Said:
              </div>
              <div className="text-sm bg-gray-50 p-2 rounded border italic">
                "{latestTranslation.homeowner_message}"
              </div>
            </div>

            {/* Roofing Term */}
            <div>
              <div className="text-xs text-muted-foreground mb-1">
                Roofing Term:
              </div>
              <div className="text-sm font-semibold text-blue-700">
                {latestTranslation.roofing_term}
              </div>
            </div>

            {/* AI Explanation */}
            {latestTranslation.ai_explanation && (
              <div>
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <Sparkles className="h-3 w-3" />
                  What the Homeowner REALLY Means:
                </div>
                <div className="text-sm bg-blue-50 p-2 rounded border border-blue-200">
                  {latestTranslation.ai_explanation}
                </div>
              </div>
            )}

            {/* Key Metrics */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <div>
                  <div className="text-xs text-muted-foreground">Severity</div>
                  <div
                    className={`text-sm font-semibold ${getSeverityColor(
                      latestTranslation.severity_score
                    )}`}
                  >
                    {latestTranslation.severity_score}/100
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <div>
                  <div className="text-xs text-muted-foreground">Confidence</div>
                  <div className="text-sm font-semibold">
                    {Math.round(latestTranslation.translation_confidence)}%
                  </div>
                </div>
              </div>
            </div>

            {/* Classification Badges */}
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">
                <Home className="h-3 w-3 mr-1" />
                {formatDamageType(latestTranslation.damage_type)}
              </Badge>
              <Badge variant="outline">
                <Wrench className="h-3 w-3 mr-1" />
                {formatDamageType(latestTranslation.repair_category)}
              </Badge>
              {latestTranslation.storm_category && (
                <Badge variant="outline">
                  <CloudLightning className="h-3 w-3 mr-1" />
                  {formatDamageType(latestTranslation.storm_category)}
                </Badge>
              )}
              {latestTranslation.insurance_category && (
                <Badge variant="outline">
                  <Shield className="h-3 w-3 mr-1" />
                  {formatDamageType(latestTranslation.insurance_category)}
                </Badge>
              )}
            </div>

            {/* Detected Keywords */}
            {keywords.length > 0 && (
              <div>
                <div className="text-xs text-muted-foreground mb-2">
                  Industry Keywords Detected:
                </div>
                <div className="flex flex-wrap gap-1">
                  {keywords.map((keyword, idx) => (
                    <Badge
                      key={idx}
                      variant="secondary"
                      className="text-xs"
                      title={keywordExplanations[keyword] || ""}
                    >
                      {keyword}
                    </Badge>
                  ))}
                </div>
                {Object.keys(keywordExplanations).length > 0 && (
                  <div className="mt-2 space-y-1">
                    {Object.entries(keywordExplanations).slice(0, 3).map(([keyword, explanation]) => (
                      <div key={keyword} className="text-xs text-muted-foreground">
                        <span className="font-medium">{keyword}:</span> {explanation}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Recommended Action */}
            {latestTranslation.recommended_action && (
              <div>
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Recommended Action:
                </div>
                <div className="text-sm font-medium">
                  {latestTranslation.recommended_action}
                </div>
              </div>
            )}

            {/* Recommended Tasks */}
            {latestTranslation.recommended_tasks &&
              latestTranslation.recommended_tasks.length > 0 && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">
                    Suggested Tasks:
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {latestTranslation.recommended_tasks.map((task, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs">
                        {task.replace(/_/g, " ")}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

            {/* Material Detection */}
            {latestTranslation.detected_material && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">
                  Detected Material:
                </div>
                <Badge variant="outline">
                  {latestTranslation.detected_material.replace(/_/g, " ")}
                  {latestTranslation.material_confidence > 0 && (
                    <span className="ml-1 text-xs">
                      ({Math.round(latestTranslation.material_confidence)}%)
                    </span>
                  )}
                </Badge>
              </div>
            )}

            {/* Replacement Probability */}
            {latestTranslation.replacement_probability !== "uncertain" && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">
                  Replacement Likelihood:
                </div>
                <Badge
                  variant={
                    latestTranslation.replacement_probability === "high"
                      ? "destructive"
                      : "outline"
                  }
                >
                  {latestTranslation.replacement_probability.toUpperCase()} (
                  {latestTranslation.replacement_likelihood_score}%)
                </Badge>
              </div>
            )}

            {/* Timestamp */}
            <div className="text-xs text-muted-foreground pt-2 border-t">
              Translated {new Date(latestTranslation.created_at).toLocaleString()}
            </div>
          </div>
        )}

        {/* No Translations */}
        {!latestTranslation && !loading && (
          <div className="text-center py-8 text-muted-foreground">
            <Languages className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No translations yet</p>
            <p className="text-xs mt-1">
              Enter a homeowner message above to translate it to roofing terminology
            </p>
          </div>
        )}

        {/* Translation History Count */}
        {translations.length > 1 && (
          <div className="text-xs text-muted-foreground text-center pt-2 border-t">
            {translations.length} total translation{translations.length !== 1 ? "s" : ""}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

