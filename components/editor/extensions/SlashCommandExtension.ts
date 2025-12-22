import { Extension } from '@tiptap/core';
import { SlashCommandList } from './SlashCommandList';

// These are optional - if not installed, autocomplete will be disabled
// Install with: npm install @tiptap/suggestion tippy.js
let Suggestion: any;
let tippy: any;
let ReactRenderer: any;

if (typeof window !== 'undefined') {
  try {
    // @ts-ignore - dynamic import
    Suggestion = require('@tiptap/suggestion')?.default;
    // @ts-ignore - dynamic import
    tippy = require('tippy.js')?.default;
    // @ts-ignore - dynamic import
    ReactRenderer = require('@tiptap/react')?.ReactRenderer;
  } catch (e) {
    // Dependencies not installed - autocomplete will be disabled
  }
}

export interface SlashCommandExtensionOptions {
  onCommand: (command: string, selectedText?: string) => Promise<string>;
}

const commands = [
  { id: 'rewrite-shorter', label: 'Rewrite shorter', description: 'Make it more concise' },
  { id: 'expand', label: 'Expand', description: 'Add more detail' },
  { id: 'make-friendlier', label: 'Make friendlier', description: 'Warmer, more casual tone' },
  { id: 'make-direct', label: 'Make more direct', description: 'Straightforward, no fluff' },
  { id: 'fix-grammar', label: 'Fix grammar', description: 'Correct grammar and spelling' },
  { id: 'add-cta', label: 'Add CTA', description: 'Add a call-to-action' },
  { id: 'add-opener', label: 'Add opener', description: 'Add an attention-grabbing opener' },
];

export const SlashCommandExtension = Extension.create<SlashCommandExtensionOptions>({
  name: 'slashCommand',

  addOptions() {
    return {
      onCommand: async () => '',
    };
  },

  addProseMirrorPlugins() {
    if (!Suggestion) {
      return [];
    }
    return [
      Suggestion({
        editor: this.editor,
        char: '/',
        pluginKey: 'slashCommand',
        command: async ({ editor, range, props }) => {
          const { from, to } = range;
          const selectedText = editor.state.doc.textBetween(from, to);
          
          // Get the full text around the selection for context
          const fullText = editor.getText();
          
          try {
            const result = await this.options.onCommand(props.command.id, selectedText || fullText);
            
            if (result) {
              editor
                .chain()
                .focus()
                .deleteRange(range)
                .insertContent(result)
                .run();
            }
          } catch (error) {
            console.error('Slash command error:', error);
          }
        },
        items: ({ query }) => {
          return commands
            .filter((cmd) => 
              cmd.label.toLowerCase().includes(query.toLowerCase()) ||
              cmd.description.toLowerCase().includes(query.toLowerCase())
            )
            .map((cmd) => ({ command: cmd }));
        },
        render: () => {
          if (!ReactRenderer || !tippy) {
            return {};
          }
          let component: any;
          let popup: any[];

          return {
            onStart: (props) => {
              component = new ReactRenderer(SlashCommandList, {
                props,
                editor: props.editor,
              });

              if (!props.clientRect) {
                return;
              }

              popup = tippy('body', {
                getReferenceClientRect: props.clientRect,
                appendTo: () => document.body,
                content: component.element,
                showOnCreate: true,
                interactive: true,
                trigger: 'manual',
                placement: 'bottom-start',
              });
            },

            onUpdate(props) {
              component.updateProps(props);

              if (!props.clientRect) {
                return;
              }

              popup[0].setProps({
                getReferenceClientRect: props.clientRect,
              });
            },

            onKeyDown(props) {
              if (props.event.key === 'Escape') {
                popup[0].hide();
                return true;
              }

              return component.ref?.onKeyDown(props);
            },

            onExit() {
              popup[0].destroy();
              component.destroy();
            },
          };
        },
      }),
    ];
  },
});

