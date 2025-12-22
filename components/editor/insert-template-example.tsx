/**
 * Example: How to use InsertTemplate component in an email editor
 * 
 * This shows how to integrate the InsertTemplate component with TipTap editor
 * and replace variables using the replaceVars helper function.
 */

"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { InsertTemplate } from "./insert-template";
import { replaceVars } from "@/lib/replaceVars";

// Example usage in a composer component
export function ExampleComposerWithTemplates({
  lead,
  user,
  workspace,
}: {
  lead: {
    first_name?: string | null;
    last_name?: string | null;
    company?: string | null;
    email?: string | null;
  };
  user: {
    full_name?: string | null;
    email?: string | null;
  };
  workspace: {
    name?: string | null;
  };
}) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: "<p></p>",
  });

  const handleTemplateSelect = (template: { body: string }) => {
    if (!editor) return;

    // Replace variables in template body
    const filled = replaceVars(template.body, lead, user, workspace);

    // Insert into editor
    editor.chain().focus().insertContent(filled).run();
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {/* Insert Template dropdown */}
        <InsertTemplate onSelect={handleTemplateSelect} />
      </div>

      {/* TipTap Editor */}
      <EditorContent editor={editor} />
    </div>
  );
}










