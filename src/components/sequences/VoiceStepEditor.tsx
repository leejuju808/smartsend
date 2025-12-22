// Voice Step Editor Component
// Block 467 — AI Voice Steps v1

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { Card, CardContent } from "@/components/ui/Card";

interface VoiceStepConfig {
  step_name?: string;
  voice_voicemail_enabled: boolean;
  voice_voicemail_script?: string;
  voice_voicemail_script_type: "ai_generated" | "manual" | "pre_recorded";
  voice_voicemail_audio_url?: string;
  voice_voicemail_goal?: "quick_callback" | "book_meeting" | "introduce_yourself" | "followup_after_email" | "value_reminder";
  voice_voicemail_tone?: "friendly" | "direct" | "professional" | "energetic";
  voice_call_script_enabled: boolean;
  voice_call_script?: string;
  voice_call_script_type: "ai_generated" | "manual";
  voice_sms_fallback_enabled: boolean;
  voice_sms_fallback_message?: string;
  voice_sms_fallback_triggers?: string[];
  voice_assign_to?: string;
  voice_priority?: "low" | "normal" | "high" | "urgent";
}

interface VoiceStepEditorProps {
  step: VoiceStepConfig;
  onChange: (step: VoiceStepConfig) => void;
}

export function VoiceStepEditor({ step, onChange }: VoiceStepEditorProps) {
  const [generatingVoicemail, setGeneratingVoicemail] = useState(false);
  const [generatingCallScript, setGeneratingCallScript] = useState(false);

  const generateVoicemailScript = async () => {
    if (!step.voice_voicemail_goal) {
      alert("Please select a voicemail goal first");
      return;
    }

    setGeneratingVoicemail(true);
    try {
      const response = await fetch("/api/ai/voice/voicemail-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal: step.voice_voicemail_goal,
          tone: step.voice_voicemail_tone || "friendly",
          include_sms_fallback: step.voice_sms_fallback_enabled,
        }),
      });

      const data = await response.json();
      if (data.ok) {
        onChange({
          ...step,
          voice_voicemail_script: data.voicemail_script,
          voice_voicemail_script_type: "ai_generated",
          voice_sms_fallback_message: data.sms_fallback || step.voice_sms_fallback_message,
        });
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error("Error generating voicemail script:", error);
      alert("Failed to generate voicemail script");
    } finally {
      setGeneratingVoicemail(false);
    }
  };

  const generateCallScript = async () => {
    setGeneratingCallScript(true);
    try {
      const response = await fetch("/api/ai/voice/call-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          include_objection_handling: true,
        }),
      });

      const data = await response.json();
      if (data.ok) {
        onChange({
          ...step,
          voice_call_script: data.full_script,
          voice_call_script_type: "ai_generated",
        });
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      console.error("Error generating call script:", error);
      alert("Failed to generate call script");
    } finally {
      setGeneratingCallScript(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-4">
          <div>
            <label className="text-sm font-medium mb-1 block">Step Name</label>
            <Input
              value={step.step_name || ""}
              onChange={(e) => onChange({ ...step, step_name: e.target.value })}
              placeholder="Voice Step 1"
            />
          </div>

          {/* Voicemail Configuration */}
          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium">Voicemail Drop</label>
              <input
                type="checkbox"
                checked={step.voice_voicemail_enabled}
                onChange={(e) =>
                  onChange({ ...step, voice_voicemail_enabled: e.target.checked })
                }
                className="rounded"
              />
            </div>

            {step.voice_voicemail_enabled && (
              <div className="space-y-3 pl-4 border-l-2">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      Goal
                    </label>
                    <select
                      value={step.voice_voicemail_goal || ""}
                      onChange={(e) =>
                        onChange({
                          ...step,
                          voice_voicemail_goal: e.target.value as any,
                        })
                      }
                      className="w-full border rounded px-2 py-1 text-sm"
                    >
                      <option value="">Select goal</option>
                      <option value="quick_callback">Quick Callback</option>
                      <option value="book_meeting">Book a Meeting</option>
                      <option value="introduce_yourself">Introduce Yourself</option>
                      <option value="followup_after_email">Follow-up After Email</option>
                      <option value="value_reminder">Value Reminder</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      Tone
                    </label>
                    <select
                      value={step.voice_voicemail_tone || "friendly"}
                      onChange={(e) =>
                        onChange({
                          ...step,
                          voice_voicemail_tone: e.target.value as any,
                        })
                      }
                      className="w-full border rounded px-2 py-1 text-sm"
                    >
                      <option value="friendly">Friendly</option>
                      <option value="direct">Direct</option>
                      <option value="professional">Professional</option>
                      <option value="energetic">Energetic</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Script Type
                  </label>
                  <select
                    value={step.voice_voicemail_script_type}
                    onChange={(e) =>
                      onChange({
                        ...step,
                        voice_voicemail_script_type: e.target.value as any,
                      })
                    }
                    className="w-full border rounded px-2 py-1 text-sm"
                  >
                    <option value="ai_generated">AI Generated</option>
                    <option value="manual">Manual</option>
                    <option value="pre_recorded">Pre-recorded</option>
                  </select>
                </div>

                {step.voice_voicemail_script_type === "ai_generated" && (
                  <div>
                    <Button
                      type="button"
                      onClick={generateVoicemailScript}
                      disabled={generatingVoicemail || !step.voice_voicemail_goal}
                      size="sm"
                    >
                      {generatingVoicemail ? "Generating..." : "Generate Script"}
                    </Button>
                  </div>
                )}

                {step.voice_voicemail_script_type === "manual" && (
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      Voicemail Script
                    </label>
                    <Textarea
                      value={step.voice_voicemail_script || ""}
                      onChange={(e) =>
                        onChange({ ...step, voice_voicemail_script: e.target.value })
                      }
                      rows={4}
                      placeholder="Hey {{first_name}}, Julian here..."
                    />
                  </div>
                )}

                {step.voice_voicemail_script_type === "pre_recorded" && (
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      Audio URL
                    </label>
                    <Input
                      value={step.voice_voicemail_audio_url || ""}
                      onChange={(e) =>
                        onChange({ ...step, voice_voicemail_audio_url: e.target.value })
                      }
                      placeholder="https://..."
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Upload MP3 or WAV file
                    </p>
                  </div>
                )}

                {step.voice_voicemail_script && (
                  <div className="bg-gray-50 p-3 rounded text-sm">
                    <strong>Script Preview:</strong>
                    <p className="mt-1 whitespace-pre-wrap">
                      {step.voice_voicemail_script}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Call Script Configuration */}
          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium">Call Script</label>
              <input
                type="checkbox"
                checked={step.voice_call_script_enabled}
                onChange={(e) =>
                  onChange({ ...step, voice_call_script_enabled: e.target.checked })
                }
                className="rounded"
              />
            </div>

            {step.voice_call_script_enabled && (
              <div className="space-y-3 pl-4 border-l-2">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Script Type
                  </label>
                  <select
                    value={step.voice_call_script_type}
                    onChange={(e) =>
                      onChange({
                        ...step,
                        voice_call_script_type: e.target.value as any,
                      })
                    }
                    className="w-full border rounded px-2 py-1 text-sm"
                  >
                    <option value="ai_generated">AI Generated</option>
                    <option value="manual">Manual</option>
                  </select>
                </div>

                {step.voice_call_script_type === "ai_generated" && (
                  <div>
                    <Button
                      type="button"
                      onClick={generateCallScript}
                      disabled={generatingCallScript}
                      size="sm"
                    >
                      {generatingCallScript ? "Generating..." : "Generate Call Script"}
                    </Button>
                  </div>
                )}

                {step.voice_call_script_type === "manual" && (
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      Call Script
                    </label>
                    <Textarea
                      value={step.voice_call_script || ""}
                      onChange={(e) =>
                        onChange({ ...step, voice_call_script: e.target.value })
                      }
                      rows={8}
                      placeholder="1. Intro: ..."
                    />
                  </div>
                )}

                {step.voice_call_script && (
                  <div className="bg-gray-50 p-3 rounded text-sm">
                    <strong>Script Preview:</strong>
                    <pre className="mt-1 whitespace-pre-wrap text-xs">
                      {step.voice_call_script}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* SMS Fallback Configuration */}
          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium">SMS Fallback</label>
              <input
                type="checkbox"
                checked={step.voice_sms_fallback_enabled}
                onChange={(e) =>
                  onChange({ ...step, voice_sms_fallback_enabled: e.target.checked })
                }
                className="rounded"
              />
            </div>

            {step.voice_sms_fallback_enabled && (
              <div className="space-y-3 pl-4 border-l-2">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Fallback Message
                  </label>
                  <Textarea
                    value={step.voice_sms_fallback_message || ""}
                    onChange={(e) =>
                      onChange({ ...step, voice_sms_fallback_message: e.target.value })
                    }
                    rows={3}
                    placeholder="Hey {{first_name}}, just left a quick voicemail..."
                  />
                </div>

                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Trigger On
                  </label>
                  <div className="space-y-1">
                    {["missed", "no_answer", "voicemail"].map((trigger) => (
                      <label key={trigger} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={
                            step.voice_sms_fallback_triggers?.includes(trigger) || false
                          }
                          onChange={(e) => {
                            const triggers = step.voice_sms_fallback_triggers || [];
                            if (e.target.checked) {
                              onChange({
                                ...step,
                                voice_sms_fallback_triggers: [...triggers, trigger],
                              });
                            } else {
                              onChange({
                                ...step,
                                voice_sms_fallback_triggers: triggers.filter(
                                  (t) => t !== trigger
                                ),
                              });
                            }
                          }}
                        />
                        {trigger.replace("_", " ")}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Assignment & Priority */}
          <div className="border-t pt-4 grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Assign To (SDR ID)
              </label>
              <Input
                value={step.voice_assign_to || ""}
                onChange={(e) => onChange({ ...step, voice_assign_to: e.target.value })}
                placeholder="Optional"
              />
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                Priority
              </label>
              <select
                value={step.voice_priority || "normal"}
                onChange={(e) =>
                  onChange({ ...step, voice_priority: e.target.value as any })
                }
                className="w-full border rounded px-2 py-1 text-sm"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}



