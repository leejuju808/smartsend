# Email Editor v2

This is the Email Editor v2 implementation for Block 262.

## Required Dependencies

The editor requires the following Tiptap packages. Install them if not already present:

```bash
npm install @tiptap/react @tiptap/starter-kit @tiptap/extension-link @tiptap/extension-placeholder @tiptap/extension-history @tiptap/suggestion tippy.js
```

For autocomplete functionality (variables and slash commands), you also need:
- `@tiptap/suggestion` - for autocomplete dropdowns
- `tippy.js` - for positioning the dropdowns

## Features Implemented

✅ Rich text editor with Tiptap
✅ Variables panel (right sidebar)
✅ Variable autocomplete (type `{{` to see suggestions)
✅ Slash command menu (type `/` for AI commands)
✅ Snippet insertion
✅ Undo/redo (Cmd+Z / Cmd+Shift+Z)
✅ Autosave (every 2 seconds)
✅ Version snapshots (last 5 versions, created every 30s)
✅ Gmail-style preview
✅ Toolbar with formatting options

## Components

- `EmailEditor.tsx` - Main editor component
- `EmailEditorToolbar.tsx` - Formatting toolbar
- `VariablesPanel.tsx` - Variables sidebar panel
- `PreviewEmail.tsx` - Email preview modal
- `extensions/VariablesExtension.ts` - Variable autocomplete extension
- `extensions/SlashCommandExtension.ts` - Slash command extension
- `extensions/SnippetsExtension.ts` - Snippet insertion extension

## API Routes

- `PATCH /api/templates/[id]/autosave` - Autosave template
- `GET /api/templates/[id]/versions` - List version history
- `POST /api/templates/[id]/versions` - Create version snapshot
- `POST /api/templates/[id]/rewrite-inline` - Inline AI rewrite

## Database Migration

Run migration `281_email_editor_v2.sql` to:
- Add `subject` and `html` columns to templates table
- Create `template_versions` table
- Set up RLS policies
- Create trigger to keep only last 5 versions









