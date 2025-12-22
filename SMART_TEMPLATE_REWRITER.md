# Smart Template Rewriter - AI-Powered

A complete AI-powered template rewriter that generates 3 distinct email variants while preserving merge tags, optimized for B2B cold outreach.

## Files Created

### 1. API Route
**File:** `src/app/api/rewrite-template/route.ts`

Endpoint: `POST /api/rewrite-template`

**Request Schema:**
```typescript
{
  subject: string;               // Email subject line
  body: string;                  // Email body content
  goal?: string;                 // "meeting-ask" | "demo-request" | "information" | "soft-intro" | "follow-up"
  tone?: string;                 // "professional" | "casual" | "friendly" | "direct" | "conversational"
  length?: string;               // "short" | "medium" | "long"
  readingLevel?: string;         // "5th" | "8th" | "12th" | "college"
  reduceSpam?: boolean;          // Enable spam trigger reduction
}
```

**Response:**
```typescript
{
  variants: Array<{
    subject: string;
    body: string;
  }>
}
```

**Features:**
- ✅ Preserves all merge tags ({{first_name}}, {{company}}, etc.)
- ✅ Generates 3 distinct variants with different angles
- ✅ Spam detection and reduction
- ✅ Configurable tone, length, and reading level
- ✅ Goal-specific optimization (meeting requests, demos, intros, etc.)
- ✅ Token guarding ensures merge tags are never lost

### 2. React Component
**File:** `src/components/_components/TemplateRewriter.tsx`

A complete UI component with:
- Live preview of generated variants
- Control panel for all parameters
- One-click apply to replace subject/body
- Loading states and error handling
- Clean, modern design

**Props:**
```typescript
{
  initialSubject: string;
  initialBody: string;
  onApplyVariant: (variant: {subject: string; body: string}, asVariant?: "A" | "B") => void;
}
```

### 3. Example Integration
**File:** `src/app/compose-example/page.tsx`

Shows how to integrate the TemplateRewriter in a compose page:
- Split-panel layout
- Left: Main editor
- Right: AI rewriter
- Instant apply to editor

### 4. QA Test Script
**File:** `scripts/test-rewrite.http`

Ready-to-use HTTP tests for the API:
- Meeting ask variant
- Demo request variant
- Soft intro variant
- Follow-up variant
- Custom merge tags test

## Usage

### Basic Integration

```typescript
import TemplateRewriter from "@/components/_components/TemplateRewriter";

export default function ComposePage() {
  const [subject, setSubject] = useState("Quick question for {{first_name}}");
  const [body, setBody] = useState("Hey {{first_name}},...");

  async function handleApply(variant: {subject: string; body: string}) {
    setSubject(variant.subject);
    setBody(variant.body);
  }

  return (
    <div className="grid md:grid-cols-2 gap-6">
      {/* Your existing editor */}
      <div>...</div>

      {/* Rewriter panel */}
      <TemplateRewriter
        initialSubject={subject}
        initialBody={body}
        onApplyVariant={handleApply}
      />
    </div>
  );
}
```

### API Testing

```bash
# Using curl
curl -X POST http://localhost:3000/api/rewrite-template \
  -H "Content-Type: application/json" \
  -d '{
    "subject": "Quick question for {{first_name}}",
    "body": "Hey {{first_name}}, we help companies...",
    "goal": "meeting-ask",
    "tone": "professional",
    "length": "short",
    "reduceSpam": true
  }'
```

Or use the included `scripts/test-rewrite.http` file with REST Client extension.

## Environment Variables

Required in `.env`:
```bash
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini  # Optional, defaults to gpt-4o-mini
```

## Key Features

### 1. Merge Tag Preservation
All `{{variable}}` tokens are protected:
- Before AI: `{{first_name}}` → `[[TK_0]]`
- After AI: `[[TK_0]]` → `{{first_name}}`
- Verification: Ensures no tags are lost

### 2. Variant Diversity
Each variant takes a different approach:
- **Variant A:** Value proposition
- **Variant B:** Social proof / curiosity
- **Variant C:** Direct hook

### 3. Spam Reduction
Automatically avoids:
- Excessive punctuation (!!!)
- ALL CAPS
- Words like "guarantee", "free"
- Overly promotional language

### 4. Goal Optimization
Different goals produce different CTAs:
- `meeting-ask`: Focus on quick, no-pressure calls
- `demo-request`: Personalized walkthroughs
- `information`: Share insights, soft CTA
- `soft-intro`: Low-friction introduction
- `follow-up`: Acknowledge previous touchpoints

## Advanced Usage

### A/B Variant Storage

If you want to store variants for A/B testing:

```typescript
async function handleApply(variant: {subject: string; body: string}, asVariant?: "A" | "B") {
  setSubject(variant.subject);
  setBody(variant.body);
  
  if (asVariant) {
    // Store as campaign_email_variants or similar
    await saveVariant(campaignId, asVariant, variant);
  }
}
```

### Custom Templates

Promote any variant to a reusable template:

```typescript
async function saveAsTemplate(variant: {subject: string; body: string}) {
  await supabase
    .from('email_templates')
    .insert({
      subject_template: variant.subject,
      body_template: variant.body,
      workspace_id: workspaceId
    });
}
```

## Next Steps

1. Test the API with the provided HTTP scripts
2. Integrate into your compose pages
3. Add usage tracking via token counts
4. Consider adding variants to database for A/B testing
5. Build analytics dashboard for variant performance

## Notes

- Merge tags must use format: `{{variable_name}}`
- Response always returns exactly 3 variants
- Reading level affects vocabulary complexity
- Reduce spam is enabled by default
- Model uses temperature 0.7 for variety

## Support

For issues or questions, check:
- `src/app/api/rewrite-template/route.ts` - API implementation
- `src/components/_components/TemplateRewriter.tsx` - Component code
- `src/app/compose-example/page.tsx` - Integration example

