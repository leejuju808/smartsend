// Block 13300 — Composer v2 Component (Reply Box)

"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Sparkles, Send, X } from "lucide-react";

type ComposerV2Props = {
  onSend: (subject: string, body: string) => Promise<void>;
  onAIDraft?: () => Promise<string>;
  templates?: Array<{ id: string; name: string; subject: string; body: string }>;
  disabled?: boolean;
};

export function ComposerV2({
  onSend,
  onAIDraft,
  templates = [],
  disabled = false,
}: ComposerV2Props) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);

  const handleSend = async () => {
    if (!body.trim() || isSending) return;
    setIsSending(true);
    try {
      await onSend(subject, body);
      setSubject("");
      setBody("");
    } catch (error) {
      console.error("Failed to send:", error);
    } finally {
      setIsSending(false);
    }
  };

  const handleAIDraft = async () => {
    if (!onAIDraft || isGeneratingDraft) return;
    setIsGeneratingDraft(true);
    try {
      const draft = await onAIDraft();
      setBody(draft);
    } catch (error) {
      console.error("Failed to generate draft:", error);
    } finally {
      setIsGeneratingDraft(false);
    }
  };

  const handleTemplateSelect = (template: { subject: string; body: string }) => {
    setSubject(template.subject);
    setBody(template.body);
    setShowTemplates(false);
  };

  return (
    <div className="border-t bg-white p-4 space-y-3">
      {/* Templates */}
      {templates.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {showTemplates ? (
            <>
              {templates.map((tpl) => (
                <button
                  key={tpl.id}
                  onClick={() => handleTemplateSelect(tpl)}
                  className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded transition-colors"
                >
                  {tpl.name}
                </button>
              ))}
              <button
                onClick={() => setShowTemplates(false)}
                className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700"
              >
                <X className="w-3 h-3" />
              </button>
            </>
          ) : (
            <button
              onClick={() => setShowTemplates(true)}
              className="px-2 py-1 text-xs text-gray-600 hover:text-gray-800"
            >
              Templates →
            </button>
          )}
        </div>
      )}

      {/* Subject */}
      <Input
        placeholder="Subject (optional)"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        disabled={disabled}
        className="text-sm"
      />

      {/* Body */}
      <div className="relative">
        <Textarea
          placeholder="Type your reply…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          disabled={disabled}
          className="text-sm pr-20"
        />
        {onAIDraft && (
          <button
            onClick={handleAIDraft}
            disabled={isGeneratingDraft || disabled}
            className="absolute top-2 right-2 p-1.5 hover:bg-gray-100 rounded transition-colors"
            title="AI Draft Reply"
          >
            <Sparkles
              className={`w-4 h-4 ${
                isGeneratingDraft ? "animate-pulse text-blue-500" : "text-gray-400"
              }`}
            />
          </button>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-gray-500">
          {/* Personalization toggles could go here */}
        </div>
        <Button
          onClick={handleSend}
          disabled={!body.trim() || isSending || disabled}
          size="sm"
        >
          <Send className="w-4 h-4 mr-2" />
          {isSending ? "Sending..." : "Send"}
        </Button>
      </div>
    </div>
  );
}





















































