// Block 21170 — SmartSend Roofing AI Phone Script Engine v1
// UI Component for Phone Script Engine Section

"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  Phone,
  Copy,
  Check,
  RefreshCw,
  Calendar,
  Mail,
  MessageSquare,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface PhoneScriptEngineProps {
  contactId: string;
  onScriptGenerated?: () => void;
}

interface PhoneScript {
  id: string;
  script_category: string;
  script_data: {
    opening?: string;
    context_summary?: string;
    value_anchor?: string;
    main_statement?: string;
    main_ask?: string;
    objection_handling?: Array<{
      objection: string;
      rebuttal: string;
    }>;
    insurance_deductible_logic?: string;
    close_sentence?: string;
    full_script?: string;
  };
  tone: string;
  status: string;
  created_at: string;
  generation_metadata?: {
    trigger_reason?: string;
  };
}

const SCRIPT_CATEGORY_LABELS: Record<string, string> = {
  homeowner_ready_to_schedule: "Install-Ready Close",
  homeowner_viewed_proposal: "Proposal Viewed",
  homeowner_claim_approved: "Claim Approved",
  homeowner_deductible_needed: "Deductible Collection",
  homeowner_booking_install: "Install Booking",
  adjuster_photo_request: "Photo Request",
  adjuster_supplement_followup: "Supplement Follow-Up",
  adjuster_approval_mismatch: "Approval Mismatch",
  adjuster_missing_line_items: "Missing Line Items",
  adjuster_op_justification: "O&P Justification",
  objection_lower_price: "Lower Price Objection",
  objection_thinking_about_it: "Thinking About It",
  objection_not_ready: "Not Ready",
  objection_waiting_insurance: "Waiting on Insurance",
  objection_too_expensive: "Too Expensive",
  deductible_explanation_what_is: "What is Deductible",
  deductible_explanation_why_pay: "Why Pay Deductible",
  deductible_explanation_waiving_illegal: "Waiving Illegal",
  deductible_explanation_acv_rcv: "ACV vs RCV",
  deductible_explanation_payment_timeline: "Payment Timeline",
  pre_install_confirm_date: "Confirm Date",
  pre_install_remind_homeowner: "Pre-Install Reminder",
  pre_install_discuss_materials: "Materials Discussion",
  pre_install_crew_arrival: "Crew Arrival",
  pre_install_access_confirmation: "Access Confirmation",
  post_install_collect_payment: "Collect Payment",
  post_install_send_warranty: "Warranty Info",
  post_install_ask_review: "Review Request",
  post_install_request_referrals: "Referral Request",
};

const TONE_LABELS: Record<string, string> = {
  confident: "Confident",
  friendly: "Friendly",
  professional: "Professional",
  high_energy: "High Energy",
  insurance_based: "Insurance-Based",
  closer: "Closer",
  softer: "Softer",
  short: "Short",
  long: "Long",
};

export function PhoneScriptEngine({
  contactId,
  onScriptGenerated,
}: PhoneScriptEngineProps) {
  const [scripts, setScripts] = useState<PhoneScript[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedScript, setSelectedScript] = useState<PhoneScript | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("homeowner_ready_to_schedule");
  const [selectedTone, setSelectedTone] = useState<string>("confident");

  useEffect(() => {
    loadScripts();
  }, [contactId]);

  async function loadScripts() {
    try {
      const res = await fetch(`/api/contacts/${contactId}/phone-script`);
      const json = await res.json();
      if (res.ok && json.scripts) {
        setScripts(json.scripts);
        if (json.scripts.length > 0) {
          setSelectedScript(json.scripts[0]);
        }
      }
    } catch (err) {
      console.error("Failed to load scripts:", err);
    } finally {
      setLoading(false);
    }
  }

  async function generateScript(category: string, tone: string) {
    setGenerating(true);
    try {
      const res = await fetch(`/api/contacts/${contactId}/phone-script`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          script_category: category,
          tone,
          regenerate: false,
        }),
      });
      const json = await res.json();
      if (res.ok && json.script) {
        await loadScripts();
        setSelectedScript(json.script);
        onScriptGenerated?.();
      } else {
        alert(json.error || "Failed to generate script");
      }
    } catch (err) {
      console.error("Failed to generate script:", err);
      alert("Failed to generate script");
    } finally {
      setGenerating(false);
    }
  }

  function handleCopy(script: PhoneScript) {
    const text = script.script_data.full_script || 
      `${script.script_data.opening || ""}\n\n${script.script_data.context_summary || ""}\n\n${script.script_data.value_anchor || ""}\n\n${script.script_data.main_statement || script.script_data.main_ask || ""}\n\n${script.script_data.close_sentence || ""}`;
    navigator.clipboard.writeText(text);
    setCopied(script.id);
    setTimeout(() => setCopied(null), 2000);
  }

  function handleRegenerate(script: PhoneScript) {
    generateScript(script.script_category, script.tone);
  }

  function handleAddToCalendar(script: PhoneScript) {
    // TODO: Implement calendar integration
    alert("Calendar integration coming soon!");
  }

  function handleSendToEmail(script: PhoneScript) {
    // TODO: Implement email sending
    alert("Email sending coming soon!");
  }

  function handleSendToSMS(script: PhoneScript) {
    // TODO: Implement SMS sending
    alert("SMS sending coming soon!");
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  const latestScript = scripts.length > 0 ? scripts[0] : null;
  const displayScript = selectedScript || latestScript;

  return (
    <Card className="border-2">
      <CardHeader className="border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-blue-600" />
            <CardTitle className="text-lg">AI Phone Script Engine</CardTitle>
            <Badge variant="outline" className="text-xs">
              v1
            </Badge>
          </div>
          {displayScript && (
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {SCRIPT_CATEGORY_LABELS[displayScript.script_category] || displayScript.script_category}
              </Badge>
              <Badge variant="outline" className="text-xs">
                {TONE_LABELS[displayScript.tone] || displayScript.tone}
              </Badge>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-6 space-y-4">
        {/* Generate New Script */}
        {scripts.length === 0 && (
          <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <label className="text-sm font-medium mb-2 block">Call Type</label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md text-sm"
                >
                  <optgroup label="Homeowner Close Calls">
                    <option value="homeowner_ready_to_schedule">Install-Ready Close</option>
                    <option value="homeowner_viewed_proposal">Proposal Viewed</option>
                    <option value="homeowner_claim_approved">Claim Approved</option>
                    <option value="homeowner_deductible_needed">Deductible Collection</option>
                    <option value="homeowner_booking_install">Install Booking</option>
                  </optgroup>
                  <optgroup label="Adjuster Calls">
                    <option value="adjuster_photo_request">Photo Request</option>
                    <option value="adjuster_supplement_followup">Supplement Follow-Up</option>
                    <option value="adjuster_approval_mismatch">Approval Mismatch</option>
                    <option value="adjuster_missing_line_items">Missing Line Items</option>
                    <option value="adjuster_op_justification">O&P Justification</option>
                  </optgroup>
                  <optgroup label="Objection Handling">
                    <option value="objection_lower_price">Lower Price</option>
                    <option value="objection_thinking_about_it">Thinking About It</option>
                    <option value="objection_not_ready">Not Ready</option>
                    <option value="objection_waiting_insurance">Waiting on Insurance</option>
                    <option value="objection_too_expensive">Too Expensive</option>
                  </optgroup>
                </select>
              </div>
              <div className="flex-1">
                <label className="text-sm font-medium mb-2 block">Tone</label>
                <select
                  value={selectedTone}
                  onChange={(e) => setSelectedTone(e.target.value)}
                  className="w-full px-3 py-2 border rounded-md text-sm"
                >
                  <option value="confident">Confident</option>
                  <option value="friendly">Friendly</option>
                  <option value="professional">Professional</option>
                  <option value="high_energy">High Energy</option>
                  <option value="insurance_based">Insurance-Based</option>
                  <option value="closer">Closer</option>
                  <option value="softer">Softer</option>
                  <option value="short">Short</option>
                  <option value="long">Long</option>
                </select>
              </div>
            </div>
            <Button
              onClick={() => generateScript(selectedCategory, selectedTone)}
              disabled={generating}
              className="w-full"
            >
              {generating ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate Script
                </>
              )}
            </Button>
          </div>
        )}

        {/* Display Script */}
        {displayScript && (
          <div className="space-y-4">
            {/* Script Header */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">
                  Generated {new Date(displayScript.created_at).toLocaleString()}
                </p>
                {displayScript.generation_metadata?.trigger_reason && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Trigger: {displayScript.generation_metadata.trigger_reason}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRegenerate(displayScript)}
                  disabled={generating}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Regenerate
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopy(displayScript)}
                >
                  {copied === displayScript.id ? (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 mr-2" />
                      Copy
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Script Content */}
            <div className="space-y-4 p-4 bg-muted/30 rounded-lg border">
              {displayScript.script_data.full_script ? (
                <div className="whitespace-pre-wrap text-sm leading-relaxed">
                  {displayScript.script_data.full_script}
                </div>
              ) : (
                <div className="space-y-3 text-sm">
                  {displayScript.script_data.opening && (
                    <div>
                      <div className="font-semibold text-xs text-muted-foreground mb-1">Opening:</div>
                      <div className="leading-relaxed">{displayScript.script_data.opening}</div>
                    </div>
                  )}
                  {displayScript.script_data.context_summary && (
                    <div>
                      <div className="font-semibold text-xs text-muted-foreground mb-1">Context:</div>
                      <div className="leading-relaxed">{displayScript.script_data.context_summary}</div>
                    </div>
                  )}
                  {displayScript.script_data.value_anchor && (
                    <div>
                      <div className="font-semibold text-xs text-muted-foreground mb-1">Value Anchor:</div>
                      <div className="leading-relaxed">{displayScript.script_data.value_anchor}</div>
                    </div>
                  )}
                  {(displayScript.script_data.main_statement || displayScript.script_data.main_ask) && (
                    <div>
                      <div className="font-semibold text-xs text-muted-foreground mb-1">Main Ask:</div>
                      <div className="leading-relaxed">
                        {displayScript.script_data.main_statement || displayScript.script_data.main_ask}
                      </div>
                    </div>
                  )}
                  {displayScript.script_data.objection_handling &&
                    displayScript.script_data.objection_handling.length > 0 && (
                      <div>
                        <div className="font-semibold text-xs text-muted-foreground mb-2">Objection Handling:</div>
                        <div className="space-y-2 pl-4 border-l-2">
                          {displayScript.script_data.objection_handling.map((obj, idx) => (
                            <div key={idx}>
                              <div className="font-medium text-xs mb-1">
                                Objection: {obj.objection}
                              </div>
                              <div className="text-muted-foreground">{obj.rebuttal}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  {displayScript.script_data.insurance_deductible_logic && (
                    <div>
                      <div className="font-semibold text-xs text-muted-foreground mb-1">Insurance Logic:</div>
                      <div className="leading-relaxed">
                        {displayScript.script_data.insurance_deductible_logic}
                      </div>
                    </div>
                  )}
                  {displayScript.script_data.close_sentence && (
                    <div>
                      <div className="font-semibold text-xs text-muted-foreground mb-1">Close:</div>
                      <div className="leading-relaxed font-medium">
                        {displayScript.script_data.close_sentence}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleAddToCalendar(displayScript)}
              >
                <Calendar className="h-4 w-4 mr-2" />
                Add to Calendar
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSendToEmail(displayScript)}
              >
                <Mail className="h-4 w-4 mr-2" />
                Send to Email
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSendToSMS(displayScript)}
              >
                <MessageSquare className="h-4 w-4 mr-2" />
                Send to SMS
              </Button>
            </div>
          </div>
        )}

        {/* Script History */}
        {scripts.length > 1 && (
          <div className="border-t pt-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(!expanded)}
              className="w-full"
            >
              {expanded ? (
                <>
                  <ChevronUp className="h-4 w-4 mr-2" />
                  Hide Script History ({scripts.length - 1} more)
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4 mr-2" />
                  Show Script History ({scripts.length - 1} more)
                </>
              )}
            </Button>
            {expanded && (
              <div className="mt-4 space-y-2">
                {scripts.slice(1).map((script) => (
                  <div
                    key={script.id}
                    className="p-3 border rounded-lg cursor-pointer hover:bg-muted/50"
                    onClick={() => setSelectedScript(script)}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-sm">
                          {SCRIPT_CATEGORY_LABELS[script.script_category] || script.script_category}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(script.created_at).toLocaleString()} • {TONE_LABELS[script.tone] || script.tone}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopy(script);
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
















































