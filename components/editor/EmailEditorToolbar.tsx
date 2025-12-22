'use client';

import { Editor } from '@tiptap/react';
import { Bold, Italic, Underline, List, Link as LinkIcon, Undo, Redo } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EmailEditorToolbarProps {
  editor: Editor | null;
  onInsertVariable?: (variable: string) => void;
  onInsertSnippet?: () => void;
}

export function EmailEditorToolbar({ editor, onInsertVariable, onInsertSnippet }: EmailEditorToolbarProps) {
  if (!editor) return null;

  const setLink = () => {
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('URL', previousUrl);

    if (url === null) {
      return;
    }

    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }

    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  return (
    <div className="flex items-center gap-1 p-2 border-b bg-gray-50 rounded-t-lg">
      <div className="flex items-center gap-1 border-r pr-2 mr-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={editor.isActive('bold') ? 'bg-gray-200' : ''}
        >
          <Bold className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={editor.isActive('italic') ? 'bg-gray-200' : ''}
        >
          <Italic className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={editor.isActive('bulletList') ? 'bg-gray-200' : ''}
        >
          <List className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={setLink}
          className={editor.isActive('link') ? 'bg-gray-200' : ''}
        >
          <LinkIcon className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex items-center gap-1 border-r pr-2 mr-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
        >
          <Undo className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
        >
          <Redo className="h-4 w-4" />
        </Button>
      </div>

      {onInsertVariable && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            // Trigger variable panel or insert default
            onInsertVariable('first_name');
          }}
        >
          Variables
        </Button>
      )}

      {onInsertSnippet && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onInsertSnippet}
        >
          Snippets
        </Button>
      )}
    </div>
  );
}









