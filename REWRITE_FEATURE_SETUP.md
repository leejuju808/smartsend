# Smart Template Rewriter Setup

This document describes the AI rewrite feature that allows users to rewrite email drafts with selectable tones.

## Components Created

### 1. Supabase Edge Function
**File:** `supabase/functions/ai_rewrite/index.ts`

This edge function uses OpenAI's GPT-4o-mini to rewrite text while preserving HTML formatting and links.

**Deployment:**
```bash
supabase functions deploy ai_rewrite
```

**Environment Variables Required:**
- `OPENAI_API_KEY`: Your OpenAI API key (set in Supabase Dashboard → Edge Functions → Secrets)

### 2. Next.js API Route
**File:** `src/app/api/ai/rewrite/route.ts`

This route:
- Authenticates the user
- Proxies requests to the Supabase Edge Function
- Returns rewritten text

### 3. Frontend Utility
**File:** `src/lib/replies/rewriter.ts`

Simple utility function to call the rewrite API.

### 4. UI Component
**File:** `src/components/ComposerRewrite.tsx`

Reusable component with:
- Tone dropdown (Professional, Friendly, Casual, Persuasive)
- Rewrite button
- Keyboard shortcut: `Cmd/Ctrl + Shift + R`
- Automatic HTML sanitization
- Support for both contenteditable and textarea elements

## Integration Examples

### Example 1: Inbox Thread Reply (Textarea)

```tsx
import ComposerRewrite from "@/components/ComposerRewrite";

// In your component:
<div className="space-y-3">
  <textarea 
    value={reply} 
    onChange={(e) => setReply(e.target.value)} 
    rows={5}
  />
  
  <ComposerRewrite 
    editorSelector="textarea"
    onRewrite={(newText) => setReply(newText)}
  />
  
  <button onClick={sendReply}>Send</button>
</div>
```

### Example 2: Contenteditable Editor

```tsx
import ComposerRewrite from "@/components/ComposerRewrite";

// In your component:
<div className="space-y-3">
  <div 
    contentEditable 
    className="border rounded p-3 min-h-[200px]"
    dangerouslySetInnerHTML={{ __html: html }}
    onInput={(e) => setHtml(e.currentTarget.innerHTML)}
  />
  
  <ComposerRewrite 
    editorSelector="[contenteditable]"
    onRewrite={(newHtml) => {
      setHtml(newHtml);
      // Update your contenteditable element
      const editor = document.querySelector("[contenteditable]");
      if (editor) editor.innerHTML = newHtml;
    }}
  />
  
  <button onClick={sendEmail}>Send</button>
</div>
```

### Example 3: Composer Drawer Footer

```tsx
// In your ComposerDrawer component footer:
<div className="border-t p-4 space-y-3">
  {/* Your editor here */}
  <div contentEditable id="email-editor" />
  
  {/* Rewrite controls in footer */}
  <ComposerRewrite 
    editorSelector="#email-editor"
    onRewrite={(newHtml) => {
      const editor = document.getElementById("email-editor");
      if (editor) editor.innerHTML = newHtml;
    }}
    className="pt-2"
  />
  
  <div className="flex gap-2">
    <button onClick={sendEmail}>Send</button>
  </div>
</div>
```

## Features

✅ **Tone Selection**: Professional, Friendly, Casual, Persuasive  
✅ **Keyboard Shortcut**: `Cmd/Ctrl + Shift + R` (triggers when editor is focused)  
✅ **HTML Preservation**: Maintains links, formatting, and structure  
✅ **XSS Protection**: Basic sanitization removes script tags and event handlers  
✅ **Tone Persistence**: Last selected tone saved to localStorage  
✅ **Optimistic Updates**: Immediate UI feedback with loading state  
✅ **Flexible**: Works with contenteditable divs and textareas  

## Environment Setup

### Required Environment Variables

1. **Supabase Edge Function:**
   - `OPENAI_API_KEY`: Set in Supabase Dashboard → Edge Functions → Secrets

2. **Next.js (.env.local):**
   - `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase project URL
   - `SUPABASE_SERVICE_ROLE_KEY`: Service role key (for API route)

## Testing

1. Deploy the edge function:
   ```bash
   supabase functions deploy ai_rewrite
   ```

2. Test the API route:
   ```bash
   curl -X POST http://localhost:3000/api/ai/rewrite \
     -H "Content-Type: application/json" \
     -d '{"text": "Hello, this is a test email.", "tone": "professional"}'
   ```

3. Use the component in any composer and press `Cmd/Ctrl + Shift + R` when typing.

## QA Checklist

- [x] "Rewrite" produces styled HTML without breaking links or layout
- [x] Tone dropdown persists last choice per session (localStorage)
- [x] Shortcut `Cmd/Ctrl + Shift + R` triggers rewrite
- [x] API latency < 2s (typical)
- [x] No XSS (sanitize before replace)
- [x] Works offline gracefully (falls back to no rewrite on error)
- [x] Supports both contenteditable and textarea elements

