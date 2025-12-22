import { Extension } from '@tiptap/core';
import { VariableList } from './VariableList';

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

export interface VariablesExtensionOptions {
  suggestions: string[];
}

const defaultVariables = [
  'first_name',
  'last_name',
  'company',
  'title',
  'email',
  'unsubscribe_link',
  'booking_link',
];

export const VariablesExtension = Extension.create<VariablesExtensionOptions>({
  name: 'variables',

  addOptions() {
    return {
      suggestions: defaultVariables,
    };
  },

  addProseMirrorPlugins() {
    if (!Suggestion) {
      // Return empty array if Suggestion is not available
      return [];
    }
    return [
      Suggestion({
        editor: this.editor,
        char: '{{',
        pluginKey: 'variables',
        command: ({ editor, range, props }) => {
          editor
            .chain()
            .focus()
            .insertContentAt(range, `{{${props.variable}}}`)
            .run();
        },
        items: ({ query }) => {
          const vars = this.options.suggestions || defaultVariables;
          return vars
            .filter((v) => v.toLowerCase().includes(query.toLowerCase()))
            .map((v) => ({ variable: v }));
        },
        render: () => {
          if (!ReactRenderer || !tippy) {
            return {};
          }
          let component: any;
          let popup: any[];

          return {
            onStart: (props) => {
              component = new ReactRenderer(VariableList, {
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

