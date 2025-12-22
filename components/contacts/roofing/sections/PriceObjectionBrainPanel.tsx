// Block 21200 — SmartSend Roofing Price Objection Brain v1
// UI Component for Objection Handling Panel

"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  AlertTriangle,
  MessageSquare,
  Phone,
  Mail,
  Copy,
  Check,
  RefreshCw,
  Sparkles,
  TrendingDown,
  DollarSign,
  Info,
} from "lucide-react";

interface PriceObjectionBrainPanelProps {
  threadId: string;
}

interface ObjectionResponse {
  id: string;
  detected_objection_type: string;
  detected_objection_text: string | null;
  detection_confidence: number;
  response_short: string | null;
  response_medium: string | null;
  response_long: string | null;
  response_tone: string;
  context_data: {
    insurance_rcv?: number;
    deductible?: number;
    underpayment_amount?: number;
    proposal_price?: number;
    homeowner_name?: string;
    carrier_name?: string;
  };
  response_used: boolean;
  response_format_used: string | null;
}

interface ObjectionData {
  objection_response: ObjectionResponse | null;
  detection_log: Array<{
    id: string;
    detected_objection_types: string[];
    detection_confidence: number;
    created_at: string;
  }>;
  has_objection: boolean;
}

const OBJECTION_TYPE_LABELS: Record<string, string> = {
  price_too_high: "Price Is Too High",
  other_roofer_cheaper: "Other Roofer Cheaper",
  still_getting_quotes: "Still Getting Quotes",
  insurance_didnt_approve_amount: "Insurance Didn't Approve Amount",
  want_to_wait: "Want to Wait",
  not_in_rush: "Not in a Rush",
  need_to_think: "Need to Think",
  check_with_adjuster: "Check with Adjuster",
  cant_afford_deductible: "Can't Afford Deductible",
  why_pay_deductible: "Why Pay Deductible?",
  drip_edge_not_required: "Drip Edge Not Required",
  no_steep_charge_needed: "No Steep Charge Needed",
  dont_pay_o_and_p: "Don't Pay O&P",
  scope_includes_everything: "Scope Includes Everything",
  photos_dont_support_supplement: "Photos Don't Support Supplement",
  other: "Other",
};

const TONE_LABELS: Record<string, string> = {
  confident: "Confident",
  friendly: "Friendly",
  professional: "Professional",
  short_direct: "Short & Direct",
  detailed_educational: "Detailed & Educational",
  insurance_heavy: "Insurance-Heavy",
  soft_reassurance: "Soft Reassurance",
};

export function PriceObjectionBrainPanel({ threadId }: PriceObjectionBrainPanelProps) {
  const [data, setData] = useState<ObjectionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [selectedTone, setSelectedTone] = useState<string>("confident");
  const [selectedFormat, setSelectedFormat] = useState<"short" | "medium" | "long">("medium");

  useEffect(() => {
    loadData();
  }, [threadId]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/inbox/threads/${threadId}/objection-handling`);
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error || "Failed to load objection data");
        setData(null);
      } else {
        setData(json);
        if (json.objection_response?.response_tone) {
          setSelectedTone(json.objection_response.response_tone);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load objection data");
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerate = async (regenerate = false) => {
    try {
      setGenerating(true);
      setError(null);
      const res = await fetch(`/api/inbox/threads/${threadId}/objection-handling`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tone: selectedTone,
          regenerate,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json?.error || "Failed to generate response");
      } else {
        await loadData();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate response");
    } finally {
      setGenerating(false);
    }
  };

  const handleCopy = async (text: string, format: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(format);
      setTimeout(() => setCopied(null), 2000);

      // Mark as used
      if (data?.objection_response?.id) {
        await fetch(`/api/inbox/threads/${threadId}/objection-handling`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            response_id: data.objection_response.id,
            format_used: format,
          }),
        });
      }
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const formatCurrency = (amount?: number) => {
    if (!amount) return "N/A";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Price Objection Brain
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error && !data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Price Objection Brain
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <p className="text-muted-foreground mb-4">{error}</p>
            <Button onClick={loadData} size="sm">
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const objectionResponse = data?.objection_response;
  const hasObjection = data?.has_objection || false;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            Price Objection Brain
          </CardTitle>
          <Button
            onClick={() => handleGenerate(false)}
            disabled={generating}
            variant="outline"
            size="sm"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${generating ? "animate-spin" : ""}`} />
            {generating ? "Generating..." : "Generate"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {!hasObjection && !error && (
          <div className="text-center py-8 border rounded-lg bg-green-50 dark:bg-green-950/20">
            <Check className="h-8 w-8 text-green-600 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              No price objections detected yet
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Responses will be generated automatically when objections are detected
            </p>
          </div>
        )}

        {hasObjection && objectionResponse && (
          <>
            {/* Detected Objection */}
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-orange-600" />
                  <h3 className="font-semibold text-orange-900">
                    Detected Objection: {OBJECTION_TYPE_LABELS[objectionResponse.detected_objection_type] || objectionResponse.detected_objection_type}
                  </h3>
                </div>
                <Badge variant="outline">
                  {Math.round(objectionResponse.detection_confidence * 100)}% confidence
                </Badge>
              </div>
              {objectionResponse.detected_objection_text && (
                <p className="text-sm text-orange-800 italic mt-2">
                  "{objectionResponse.detected_objection_text}"
                </p>
              )}
            </div>

            {/* Context Summary */}
            {objectionResponse.context_data && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {objectionResponse.context_data.insurance_rcv && (
                  <div className="text-center p-2 bg-blue-50 rounded-lg">
                    <div className="text-xs text-muted-foreground">Insurance RCV</div>
                    <div className="text-sm font-semibold">
                      {formatCurrency(objectionResponse.context_data.insurance_rcv)}
                    </div>
                  </div>
                )}
                {objectionResponse.context_data.deductible && (
                  <div className="text-center p-2 bg-purple-50 rounded-lg">
                    <div className="text-xs text-muted-foreground">Deductible</div>
                    <div className="text-sm font-semibold">
                      {formatCurrency(objectionResponse.context_data.deductible)}
                    </div>
                  </div>
                )}
                {objectionResponse.context_data.underpayment_amount && (
                  <div className="text-center p-2 bg-red-50 rounded-lg">
                    <div className="text-xs text-muted-foreground">Underpayment</div>
                    <div className="text-sm font-semibold">
                      {formatCurrency(objectionResponse.context_data.underpayment_amount)}
                    </div>
                  </div>
                )}
                {objectionResponse.context_data.proposal_price && (
                  <div className="text-center p-2 bg-green-50 rounded-lg">
                    <div className="text-xs text-muted-foreground">Proposal Price</div>
                    <div className="text-sm font-semibold">
                      {formatCurrency(objectionResponse.context_data.proposal_price)}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Tone Selector */}
            <div>
              <label className="text-sm font-medium mb-2 block">Response Tone</label>
              <div className="flex flex-wrap gap-2">
                {Object.entries(TONE_LABELS).map(([value, label]) => (
                  <Button
                    key={value}
                    variant={selectedTone === value ? "default" : "outline"}
                    size="sm"
                    onClick={() => {
                      setSelectedTone(value);
                      if (objectionResponse.response_tone !== value) {
                        handleGenerate(true);
                      }
                    }}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Format Selector */}
            <div>
              <label className="text-sm font-medium mb-2 block">Response Format</label>
              <div className="flex gap-2">
                <Button
                  variant={selectedFormat === "short" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedFormat("short")}
                >
                  <MessageSquare className="h-4 w-4 mr-2" />
                  SMS
                </Button>
                <Button
                  variant={selectedFormat === "medium" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedFormat("medium")}
                >
                  <Mail className="h-4 w-4 mr-2" />
                  Email
                </Button>
                <Button
                  variant={selectedFormat === "long" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedFormat("long")}
                >
                  <Phone className="h-4 w-4 mr-2" />
                  Phone
                </Button>
              </div>
            </div>

            {/* Response Display */}
            <div className="border rounded-lg p-4 bg-gray-50 dark:bg-gray-900">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold flex items-center gap-2">
                  {selectedFormat === "short" && <MessageSquare className="h-4 w-4" />}
                  {selectedFormat === "medium" && <Mail className="h-4 w-4" />}
                  {selectedFormat === "long" && <Phone className="h-4 w-4" />}
                  {selectedFormat === "short" ? "SMS Response" : selectedFormat === "medium" ? "Email Response" : "Phone Script"}
                </h4>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const text =
                      selectedFormat === "short"
                        ? objectionResponse.response_short
                        : selectedFormat === "medium"
                        ? objectionResponse.response_medium
                        : objectionResponse.response_long;
                    if (text) {
                      handleCopy(text, selectedFormat);
                    }
                  }}
                >
                  {copied === selectedFormat ? (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 mr-2" />
                      Copy
                    </>
                  )}
                </Button>
              </div>
              <div className="prose prose-sm max-w-none">
                {selectedFormat === "short" && (
                  <p className="whitespace-pre-wrap">{objectionResponse.response_short || "No short response available"}</p>
                )}
                {selectedFormat === "medium" && (
                  <p className="whitespace-pre-wrap">{objectionResponse.response_medium || "No medium response available"}</p>
                )}
                {selectedFormat === "long" && (
                  <div className="whitespace-pre-wrap">{objectionResponse.response_long || "No phone script available"}</div>
                )}
              </div>
            </div>

            {/* Usage Status */}
            {objectionResponse.response_used && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Check className="h-4 w-4 text-green-600" />
                <span>
                  Response used ({objectionResponse.response_format_used || "unknown format"})
                </span>
              </div>
            )}
          </>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
















































