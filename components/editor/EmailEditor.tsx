'use client';

import { EditorContent } from '@tiptap/react';
import { Editor } from '@tiptap/core';

interface EmailEditorProps {
  editor: Editor | null;
}

export function EmailEditor({ editor }: EmailEditorProps) {
  if (!editor) {
    return <div className="border rounded-lg p-4 min-h-[300px]">Loading editor...</div>;
  }

  return (
    <div className="bg-white">
      <EditorContent editor={editor} />
    </div>
  );
}

