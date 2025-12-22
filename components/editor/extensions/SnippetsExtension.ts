import { Extension } from '@tiptap/core';

export interface Snippet {
  id: string;
  title: string;
  body: string;
  category?: string;
}

export interface SnippetsExtensionOptions {
  snippets: Snippet[];
  onInsert: (snippet: Snippet) => void;
}

export const SnippetsExtension = Extension.create<SnippetsExtensionOptions>({
  name: 'snippets',

  addOptions() {
    return {
      snippets: [],
      onInsert: () => {},
    };
  },

  addCommands() {
    return {
      insertSnippet: (snippet: Snippet) => ({ commands }) => {
        this.options.onInsert(snippet);
        return true;
      },
    };
  },
});









