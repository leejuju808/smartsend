"use client";

import { useState } from "react";
import { Textarea } from "@/components/ui/Textarea";
import { SmartTemplateRewriter } from "@/components/templates/SmartTemplateRewriter";

/**
 * Example: Sequence step editor with AI rewrite integration
 * 
 * This shows how to integrate SmartTemplateRewriter into any editor component.
 * You can use this pattern in:
 * - Global Templates composer
 * - One-off Email composer (quick send)
 * - Sequence step editors
 * - Anywhere else you edit copy
 */
type Props = {
  initialBody: string;
  onSave: (body: string) => Promise<void>;
};

export function StepEditorExample({ initialBody, onSave }: Props) {
  const [body, setBody] = useState(initialBody);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave(body);
    setSaving(false);
  };

  return (
    <div className="space-y-3">
      {/* AI toolbar */}
      <SmartTemplateRewriter value={body} onChange={setBody} />

      {/* Editor */}
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        className="min-h-[220px] text-xs font-mono"
        placeholder="Write your sequence step here. Use {{first_name}} etc."
      />

      {/* Save button in your existing layout */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="px-4 py-2 bg-primary text-primary-foreground rounded-md disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save"}
      </button>
    </div>
  );
}







