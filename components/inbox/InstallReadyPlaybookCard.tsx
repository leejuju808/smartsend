// Block 20400 — Install-Ready Playbook Card

"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Phone, Mail, MessageSquare, Copy, Check, ChevronDown, ChevronUp } from "lucide-react";

interface CallScript {
  opener: string;
  proof_of_understanding: string;
  installation_readiness_check: string;
  supplement_trigger?: string;
  close: string;
  full_script_text: string;
}

interface FollowUpMessage {
  day_offset: number;
  channel: "email" | "sms";
  subject?: string;
  body: string;
  purpose: string;
}

interface FollowUpSequence {
  sequence_type: string;
  messages: FollowUpMessage[];
}

interface InstallReadyPlaybookCardProps {
  conversationId: string;
  initialInstallReady?: boolean | null;
}

export function InstallReadyPlaybookCard({
  conversationId,
  initialInstallReady,
}: InstallReadyPlaybookCardProps) {
  const [playbook, setPlaybook] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [showCallScript, setShowCallScript] = useState(false);
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  async function loadPlaybook() {
    setLoading(true);
    try {
      const res = await fetch(`/api/inbox/playbook/${conversationId}`);
      if (res.ok) {
        const data = await res.json();
        setPlaybook(data);
      }
    } catch (err) {
      console.error("Playbook load error", err);
    } finally {
      setLoading(false);
    }
  }

  async function generatePlaybook() {
    setGenerating(true);
    try {
      const res = await fetch(`/api/inbox/playbook/${conversationId}`, {
        method: "POST",
      });
      if (res.ok) {
        const data = await res.json();
        setPlaybook(data.result || data);
      } else {
        const error = await res.json();
        alert(error.error || "Failed to generate playbook");
      }
    } catch (err) {
      console.error("Playbook generation error", err);
      alert("Failed to generate playbook. Please try again.");
    } finally {
      setGenerating(false);
    }
  }

  function copyToClipboard(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  useEffect(() => {
    if (initialInstallReady) {
      loadPlaybook();
    }
  }, [conversationId, initialInstallReady]);

  // Don't show if not install-ready
  if (!initialInstallReady && !playbook) {
    return null;
  }

  const callScript: CallScript | null = playbook?.call_script || null;
  const followUpSequence: FollowUpSequence | null = playbook?.followup_sequence || null;
  const nextAction = playbook?.next_action || null;
  const nextActionPriority = playbook?.next_action_priority || "MEDIUM";
  const insuranceContext = playbook?.insurance_context || {};

  function priorityColor(priority: string) {
    switch (priority) {
      case "HIGH":
        return "text-red-600 bg-red-50 border-red-200";
      case "MEDIUM":
        return "text-amber-600 bg-amber-50 border-amber-200";
      default:
        return "text-gray-600 bg-gray-50 border-gray-200";
    }
  }

  function channelIcon(channel: string) {
    switch (channel) {
      case "email":
        return <Mail className="w-3 h-3" />;
      case "sms":
        return <MessageSquare className="w-3 h-3" />;
      default:
        return null;
    }
  }

  if (loading) {
    return (
      <Card className="border-l-4 border-l-green-500">
        <CardContent className="p-4">
          <div className="text-sm text-gray-500">Loading playbook...</div>
        </CardContent>
      </Card>
    );
  }

  if (!playbook?.playbook_generated) {
    return (
      <Card className="border-l-4 border-l-green-500">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Phone className="w-5 h-5 text-green-600" />
            </div>
            <div className="flex-1">
              <CardTitle className="text-base font-semibold">Install-Ready Playbook</CardTitle>
              <p className="text-xs text-gray-500 mt-1">AI-generated call script & follow-up</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Button
            onClick={generatePlaybook}
            disabled={generating}
            className="w-full bg-green-600 hover:bg-green-700 text-white"
          >
            {generating ? "Generating..." : "Generate Playbook"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-l-4 border-l-green-500">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Phone className="w-5 h-5 text-green-600" />
            </div>
            <div className="flex-1">
              <CardTitle className="text-base font-semibold">Install-Ready Playbook</CardTitle>
              <p className="text-xs text-gray-500 mt-1">AI-generated sales coach</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={loadPlaybook}
            className="text-xs"
          >
            Refresh
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Summary */}
        {insuranceContext.carrier && (
          <div className="text-xs space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-semibold">{insuranceContext.carrier}</span>
              <span className="text-gray-400">·</span>
              <span>{insuranceContext.claim_status || "Unknown status"}</span>
            </div>
            {insuranceContext.deductible && (
              <div className="text-gray-600">
                ${insuranceContext.deductible.toLocaleString()} deductible · {insuranceContext.payout_type || "Unknown"} payout
              </div>
            )}
          </div>
        )}

        {/* Next Action */}
        {nextAction && (
          <div className={`p-3 rounded-lg border ${priorityColor(nextActionPriority)}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <div className="text-xs font-semibold mb-1">Next Action</div>
                <div className="text-sm">{nextAction}</div>
              </div>
              <span className={`text-[10px] font-semibold px-2 py-1 rounded ${nextActionPriority === "HIGH" ? "bg-red-100" : nextActionPriority === "MEDIUM" ? "bg-amber-100" : "bg-gray-100"}`}>
                {nextActionPriority}
              </span>
            </div>
          </div>
        )}

        {/* Call Script */}
        {callScript && (
          <div className="space-y-2">
            <button
              onClick={() => setShowCallScript(!showCallScript)}
              className="w-full flex items-center justify-between text-left p-2 hover:bg-gray-50 rounded-lg"
            >
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-green-600" />
                <span className="text-sm font-semibold">Call Script</span>
              </div>
              {showCallScript ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            
            {showCallScript && (
              <div className="space-y-3 p-3 bg-gray-50 rounded-lg text-xs">
                <div>
                  <div className="font-semibold mb-1 text-[11px] text-gray-500">Opener</div>
                  <div className="text-sm">{callScript.opener}</div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(callScript.opener, "opener")}
                    className="mt-1 h-6 text-[10px]"
                  >
                    {copied === "opener" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  </Button>
                </div>
                
                <div>
                  <div className="font-semibold mb-1 text-[11px] text-gray-500">Proof of Understanding</div>
                  <div className="text-sm">{callScript.proof_of_understanding}</div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(callScript.proof_of_understanding, "proof")}
                    className="mt-1 h-6 text-[10px]"
                  >
                    {copied === "proof" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  </Button>
                </div>
                
                <div>
                  <div className="font-semibold mb-1 text-[11px] text-gray-500">Installation Readiness Check</div>
                  <div className="text-sm">{callScript.installation_readiness_check}</div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(callScript.installation_readiness_check, "readiness")}
                    className="mt-1 h-6 text-[10px]"
                  >
                    {copied === "readiness" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  </Button>
                </div>
                
                {callScript.supplement_trigger && (
                  <div>
                    <div className="font-semibold mb-1 text-[11px] text-gray-500">Supplement Trigger</div>
                    <div className="text-sm">{callScript.supplement_trigger}</div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copyToClipboard(callScript.supplement_trigger!, "supplement")}
                      className="mt-1 h-6 text-[10px]"
                    >
                      {copied === "supplement" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    </Button>
                  </div>
                )}
                
                <div>
                  <div className="font-semibold mb-1 text-[11px] text-gray-500">Close</div>
                  <div className="text-sm">{callScript.close}</div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copyToClipboard(callScript.close, "close")}
                    className="mt-1 h-6 text-[10px]"
                  >
                    {copied === "close" ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  </Button>
                </div>
                
                <div className="pt-2 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(callScript.full_script_text, "full")}
                    className="w-full text-xs"
                  >
                    {copied === "full" ? (
                      <>
                        <Check className="w-3 h-3 mr-2" /> Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3 mr-2" /> Copy Full Script
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Follow-Up Sequence */}
        {followUpSequence && followUpSequence.messages.length > 0 && (
          <div className="space-y-2">
            <button
              onClick={() => setShowFollowUp(!showFollowUp)}
              className="w-full flex items-center justify-between text-left p-2 hover:bg-gray-50 rounded-lg"
            >
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-blue-600" />
                <span className="text-sm font-semibold">Follow-Up Plan</span>
                <span className="text-[10px] text-gray-400">
                  ({followUpSequence.messages.length} steps)
                </span>
              </div>
              {showFollowUp ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            
            {showFollowUp && (
              <div className="space-y-2">
                {followUpSequence.messages.map((msg, idx) => (
                  <div key={idx} className="p-2 bg-gray-50 rounded-lg text-xs">
                    <div className="flex items-start justify-between mb-1">
                      <div className="flex items-center gap-2">
                        {channelIcon(msg.channel)}
                        <span className="font-semibold">Day {msg.day_offset}</span>
                        <span className="text-gray-400">·</span>
                        <span className="text-gray-500">{msg.purpose}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(msg.body, `followup-${idx}`)}
                        className="h-5 w-5 p-0"
                      >
                        {copied === `followup-${idx}` ? (
                          <Check className="w-3 h-3" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </Button>
                    </div>
                    {msg.subject && (
                      <div className="text-[11px] font-semibold text-gray-600 mb-1">
                        Subject: {msg.subject}
                      </div>
                    )}
                    <div className="text-sm text-gray-700">{msg.body}</div>
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
















































